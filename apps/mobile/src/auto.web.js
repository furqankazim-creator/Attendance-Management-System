// Browser build: the operating system's geofencing does not exist here, so automatic attendance is switched off.
export const inExpoGo = true;
export const sendAuto = async () => null;
export const regionFor = () => null;
export const autoWanted = async () => false;
export const enableAuto = async () => ({ ok: false, reason: 'expo_go' });
export const disableAuto = async () => {};
export const syncAuto = async () => {};
export const isWatching = async () => false;
