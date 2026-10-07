const withVosk = require('react-native-vosk/plugin/build/withVosk');

// react-native-vosk exports { default: fn } in CJS which causes
// "Package react-native-vosk does not contain a valid config plugin" in Expo CLI.
// Unwrapping .default guarantees a valid ConfigPlugin function export.
module.exports = withVosk.default || withVosk;
