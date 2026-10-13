import {setupShell,requireUser,$} from './common.js';
setupShell();
requireUser().catch(error=>{console.error(error);const chip=$('#accountChip');if(chip)chip.textContent='Account check failed';});
const byId = (id) => document.getElementById(id);
let device = null;
let gattServer = null;
let allowedServiceUuid = null;
function status(message, error = false) {
  const el = byId('bluetoothStatus');
  if (el) { el.textContent = message; el.style.color = error ? '#fca5a5' : ''; }
}
function commandStatus(message, error = false) {
  const el = byId('commandStatus');
  if (el) { el.textContent = message; el.style.color = error ? '#fca5a5' : ''; }
}
function setConnected(connected) {
  byId('disconnectBluetooth').disabled = !connected;
  byId('sendBleCommand').disabled = !connected;
}
byId('scanBluetooth')?.addEventListener('click', async () => {
  if (!window.isSecureContext) { status('Bluetooth access requires HTTPS (or localhost).', true); return; }
  if (!navigator.bluetooth) { status('This browser does not support Web Bluetooth. Try a supported Chrome browser on Android or desktop.', true); return; }
  const enteredUuid = byId('serviceUuid').value.trim();
  const optionalServices = enteredUuid ? [enteredUuid] : [];
  try {
    status('Choose a nearby device in the browser permission window…');
    device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices });
    allowedServiceUuid = enteredUuid || null;
    device.addEventListener('gattserverdisconnected', () => {
      gattServer = null; setConnected(false); status('Device disconnected.');
    });
    status(`Selected ${device.name || 'Bluetooth device'}. Connecting…`);
    gattServer = await device.gatt.connect();
    setConnected(true);
    byId('bluetoothDetails').hidden = false;
    byId('bluetoothDetails').textContent = `Connected to ${device.name || 'unnamed device'}. ID: ${device.id}.`;
    status('Connected. Use only the service and command details provided by your device manufacturer.');
  } catch (error) {
    setConnected(false);
    status(error?.name === 'NotFoundError' ? 'No device was selected.' : `${error?.name || 'Error'}: ${error?.message || 'Could not connect.'}`, true);
  }
});
byId('disconnectBluetooth')?.addEventListener('click', () => {
  if (device?.gatt?.connected) device.gatt.disconnect();
  gattServer = null; setConnected(false); status('Disconnected.');
});
byId('sendBleCommand')?.addEventListener('click', async () => {
  if (!gattServer?.connected) { commandStatus('Connect to a device first.', true); return; }
  const charUuid = byId('characteristicUuid').value.trim();
  const hex = byId('commandBytes').value.trim();
  if (!allowedServiceUuid) { commandStatus('Reconnect and enter the documented service UUID before pairing.', true); return; }
  if (!charUuid) { commandStatus('Enter the writable characteristic UUID from the device manual.', true); return; }
  if (!hex || !/^(?:[0-9a-fA-F]{2})(?:\s+[0-9a-fA-F]{2})*$/.test(hex)) { commandStatus('Enter hexadecimal bytes such as: 01 00', true); return; }
  try {
    const service = await gattServer.getPrimaryService(allowedServiceUuid);
    const characteristic = await service.getCharacteristic(charUuid);
    if (!characteristic.properties.write && !characteristic.properties.writeWithoutResponse) {
      throw new Error('This characteristic is not writable.');
    }
    const bytes = Uint8Array.from(hex.split(/\s+/).map(v => parseInt(v, 16)));
    if (characteristic.properties.write) await characteristic.writeValueWithResponse(bytes);
    else await characteristic.writeValueWithoutResponse(bytes);
    commandStatus('Command sent. Check the device response; this does not guarantee the device performed the action.');
  } catch (error) {
    commandStatus(`${error?.name || 'Error'}: ${error?.message || 'Command failed.'}`, true);
  }
});
setConnected(false);

// Plain-language helper: explain intent without guessing proprietary command bytes.
const plainInput = document.getElementById('plainBleCommand');
const plainResult = document.getElementById('plainBleResult');
document.querySelectorAll('[data-example]').forEach(button => button.addEventListener('click', () => { if(plainInput) plainInput.value=button.dataset.example; interpretPlainCommand(); }));
function interpretPlainCommand(){
 const value=(plainInput?.value||'').trim().toLowerCase(); if(!plainResult)return;
 if(!value){plainResult.textContent='Type a short command first.';return;}
 if(/disconnect|unpair/.test(value)){plainResult.textContent='Use the Disconnect button above. This safely closes the current BLE session.';return;}
 if(/relay|switch|turn on|power on/.test(value)){plainResult.textContent='This sounds like a relay/switch action. Select a compatible BLE device, then enter the exact service UUID, writable characteristic UUID, and ON command bytes from its manual. Wi-Fi Hub will not guess the bytes because the wrong command may affect hardware unexpectedly.';return;}
 if(/turn off|power off|off/.test(value)){plainResult.textContent='This sounds like an OFF action. Confirm the device-specific OFF bytes in its manual before sending them using the documented command panel.';return;}
 if(/battery/.test(value)){plainResult.textContent='Battery readings usually use a documented Battery Service/characteristic. Enter the device service UUID; this current tool writes documented commands and does not yet decode arbitrary read responses.';return;}
 if(/router|wi.?fi|restart|reboot/.test(value)){plainResult.textContent='Router control is not available over generic Bluetooth unless the router exposes a documented BLE control service. Use My Network with a supported secure router integration; the address alone cannot power-cycle a router.';return;}
 plainResult.textContent='I could not map that to a safe generic BLE action. Check the device manual for its supported service and command format, or describe the device model.';
}
document.getElementById('interpretBleCommand')?.addEventListener('click',interpretPlainCommand);
