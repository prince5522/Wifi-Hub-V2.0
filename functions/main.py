"""Wi-Fi Hub authenticated command API for Firebase Functions.

Users authenticate with Firebase ID tokens. Commands are queued in Firestore for
an explicitly provisioned device; this API never fetches arbitrary user-supplied
LAN URLs or sends arbitrary router HTTP requests.
"""
from datetime import datetime, timezone, timedelta
import hashlib
import hmac
import logging
import os
import secrets

from firebase_functions import https_fn, options
from firebase_admin import initialize_app, auth, firestore
from firebase_admin.exceptions import FirebaseError
from flask import jsonify, request

initialize_app()
db = firestore.client()
logging.basicConfig(level=logging.INFO)

ALLOWED_METHODS = ["GET", "POST", "OPTIONS"]
ALLOWED_HEADERS = ["Authorization", "Content-Type", "X-Device-Token"]
USER_ACTIONS = {"restart", "wifi_on", "wifi_off", "relay_on", "relay_off", "status"}
DEVICE_ACTIONS = {"relay_on", "relay_off", "status"}


def _cors(response):
    allowed = {v.strip() for v in os.environ.get(
        "WIFI_HUB_ALLOWED_ORIGINS", "https://prince5522.github.io"
    ).split(",") if v.strip()}
    origin = request.headers.get("Origin", "")
    if origin in allowed:
        response.headers["Access-Control-Allow-Origin"] = origin
    response.headers["Vary"] = "Origin"
    response.headers["Access-Control-Allow-Methods"] = ", ".join(ALLOWED_METHODS)
    response.headers["Access-Control-Allow-Headers"] = ", ".join(ALLOWED_HEADERS)
    response.headers["Access-Control-Max-Age"] = "3600"
    response.headers["Cache-Control"] = "no-store"
    return response


def _json(payload, status=200):
    return _cors(jsonify(payload)), status


def _now():
    return datetime.now(timezone.utc)


def _require_user():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None, (jsonify({"ok": False, "message": "Sign in to use this service."}), 401)
    token = header[7:].strip()
    try:
        decoded = auth.verify_id_token(token, check_revoked=True)
        uid = decoded.get("uid")
        if not uid:
            raise ValueError("No uid in token")
        snap = db.collection("users").document(uid).get()
        profile = snap.to_dict() or {}
        if not snap.exists or profile.get("active") is not True:
            return None, (jsonify({"ok": False, "message": "This account is inactive or its profile is missing."}), 403)
        return {"uid": uid, "email": decoded.get("email", ""), "profile": profile}, None
    except (ValueError, FirebaseError) as exc:
        logging.info("Rejected Firebase token: %s", type(exc).__name__)
        return None, (jsonify({"ok": False, "message": "Your session is invalid or expired. Sign in again."}), 401)


def _user_or_error():
    user, error = _require_user()
    if error:
        response, status = error
        return None, (_cors(response), status)
    return user, None


def _owned_device(user, device_id):
    # Device IDs are constrained to avoid path tricks and unreasonable document IDs.
    if not device_id or len(device_id) > 100 or "/" in device_id:
        return None
    ref = db.collection("users").document(user["uid"]).collection("devices").document(device_id)
    snap = ref.get()
    if not snap.exists:
        return None
    data = snap.to_dict() or {}
    if data.get("ownerUid", user["uid"]) != user["uid"]:
        return None
    return ref, data


@https_fn.on_request(cors=options.CorsOptions(
    cors_origins=["https://prince5522.github.io"],
    cors_methods=["get", "post", "options"],
    cors_headers=["authorization", "content-type", "x-device-token"], max_age=3600
))
def api(req: https_fn.Request):
    path = (req.path or "/").rstrip("/") or "/"
    if req.method == "OPTIONS":
        return ("", 204)

    if path in ("/", "/health", "/api/health") and req.method == "GET":
        return _json({"ok": True, "service": "Wi-Fi Hub API", "auth": "Firebase ID token verification enabled",
                      "commandQueue": "enabled", "routerAdapter": "model-specific integration required"})

    # All user-facing device routes require a verified Firebase ID token.
    if path in ("/devices", "/api/devices") and req.method == "GET":
        user, error = _user_or_error()
        if error: return error
        docs = db.collection("users").document(user["uid"]).collection("devices").stream()
        devices = []
        for doc in docs:
            item = doc.to_dict() or {}
            devices.append({"id": doc.id, "name": item.get("name", doc.id),
                            "deviceType": item.get("deviceType", "unknown"),
                            "connectionType": item.get("connectionType", "not-configured"),
                            "status": item.get("status", "not-configured")})
        return _json({"ok": True, "devices": devices})

    # Provision a device secret once. The raw secret is returned only in this response;
    # Firestore stores only its SHA-256 hash. Keep the secret out of screenshots/logs.
    parts = [p for p in path.split("/") if p]
    if len(parts) == 3 and parts[0] in ("devices", "api"):
        # Support /devices/{id}/provision; /api/devices/{id}/provision is handled below.
        pass
    if len(parts) == 3 and parts[0] == "devices" and parts[2] == "provision" and req.method == "POST":
        user, error = _user_or_error()
        if error: return error
        owned = _owned_device(user, parts[1])
        if not owned: return _json({"ok": False, "message": "Device not found in your account."}, 404)
        device_ref, data = owned
        if str(data.get("deviceType", "")).lower() not in ("esp8266", "esp32", "smart switch", "smart-switch"):
            return _json({"ok": False, "message": "Provisioning is currently for ESP8266/ESP32 Smart Switch devices."}, 400)
        secret = secrets.token_urlsafe(32)
        digest = hashlib.sha256(secret.encode("utf-8")).hexdigest()
        db.collection("deviceKeys").document(parts[1]).set({
            "ownerUid": user["uid"], "devicePath": device_ref.path, "tokenHash": digest,
            "createdAt": firestore.SERVER_TIMESTAMP, "revoked": False
        })
        device_ref.update({"status": "provisioned", "updatedAt": firestore.SERVER_TIMESTAMP})
        return _json({"ok": True, "deviceId": parts[1], "deviceToken": secret,
                      "warning": "Copy this token into the device firmware now. It will not be shown again."}, 201)

    if len(parts) == 3 and parts[0] == "devices" and parts[2] == "command" and req.method == "POST":
        user, error = _user_or_error()
        if error: return error
        owned = _owned_device(user, parts[1])
        if not owned: return _json({"ok": False, "message": "Device not found in your account."}, 404)
        device_ref, data = owned
        body = req.get_json(silent=True) or {}
        action = str(body.get("action", "")).strip().lower()
        device_type = str(data.get("deviceType", "")).lower()
        allowed = USER_ACTIONS if "router" in device_type else DEVICE_ACTIONS
        if action not in allowed:
            return _json({"ok": False, "message": "This command is not supported for this device type."}, 400)
        if action in {"relay_on", "relay_off"} and not any(x in device_type for x in ("esp", "switch")):
            return _json({"ok": False, "message": "Relay commands require an ESP/Smart Switch device."}, 400)
        command_ref = device_ref.collection("commands").document()
        command_ref.set({"action": action, "status": "queued", "ownerUid": user["uid"],
                         "createdAt": firestore.SERVER_TIMESTAMP,
                         "expiresAt": _now() + timedelta(minutes=2)})
        return _json({"ok": True, "commandId": command_ref.id, "status": "queued",
                      "message": "Command queued. It will run only if the device agent is online and supports this command."}, 202)

    # Device agent endpoints authenticate using a per-device token; they never accept LAN URLs.
    if path in ("/device/poll", "/api/device/poll") and req.method == "POST":
        body = req.get_json(silent=True) or {}
        device_id = str(body.get("deviceId", ""))
        secret = request.headers.get("X-Device-Token", "")
        key_snap = db.collection("deviceKeys").document(device_id).get() if device_id else None
        key = key_snap.to_dict() if key_snap and key_snap.exists else None
        if not key or key.get("revoked") is True or not secret:
            return _json({"ok": False, "message": "Device is not provisioned."}, 401)
        digest = hashlib.sha256(secret.encode("utf-8")).hexdigest()
        if not hmac.compare_digest(digest, str(key.get("tokenHash", ""))):
            return _json({"ok": False, "message": "Invalid device token."}, 401)
        device_ref = db.document(key["devicePath"])
        pending = device_ref.collection("commands").where("status", "==", "queued").limit(5).stream()
        for command in pending:
            item = command.to_dict() or {}
            expiry = item.get("expiresAt")
            if expiry and hasattr(expiry, "timestamp") and expiry < _now():
                command.reference.update({"status": "expired", "updatedAt": firestore.SERVER_TIMESTAMP})
                continue
            command.reference.update({"status": "sent", "sentAt": firestore.SERVER_TIMESTAMP})
            device_ref.update({"lastSeenAt": firestore.SERVER_TIMESTAMP, "status": "online"})
            return _json({"ok": True, "command": {"id": command.id, "action": item.get("action")}})
        device_ref.update({"lastSeenAt": firestore.SERVER_TIMESTAMP, "status": "online"})
        return _json({"ok": True, "command": None})

    if path in ("/device/result", "/api/device/result") and req.method == "POST":
        body = req.get_json(silent=True) or {}
        device_id = str(body.get("deviceId", "")); command_id = str(body.get("commandId", ""))
        secret = request.headers.get("X-Device-Token", "")
        key_snap = db.collection("deviceKeys").document(device_id).get() if device_id else None
        key = key_snap.to_dict() if key_snap and key_snap.exists else None
        digest = hashlib.sha256(secret.encode("utf-8")).hexdigest() if secret else ""
        if not key or key.get("revoked") is True or not hmac.compare_digest(digest, str(key.get("tokenHash", ""))):
            return _json({"ok": False, "message": "Invalid device credentials."}, 401)
        device_ref = db.document(key["devicePath"])
        command_ref = device_ref.collection("commands").document(command_id)
        snap = command_ref.get()
        if not snap.exists: return _json({"ok": False, "message": "Command not found."}, 404)
        result = str(body.get("result", "failed"))
        if result not in ("succeeded", "failed"): result = "failed"
        command_ref.update({"status": result, "resultMessage": str(body.get("message", ""))[:300],
                            "completedAt": firestore.SERVER_TIMESTAMP})
        device_ref.update({"lastSeenAt": firestore.SERVER_TIMESTAMP, "status": "online"})
        return _json({"ok": True})

    if path in ("/router/action", "/api/router/action") and req.method == "POST":
        return _json({"ok": False, "code": "use_device_command_endpoint",
                      "message": "Select a saved, owned router and send its supported action through /devices/{deviceId}/command. Router-specific adapters are still required."}, 501)

    return _json({"ok": False, "message": "Endpoint not found."}, 404)
