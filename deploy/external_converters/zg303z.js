import * as tuya from 'zigbee-herdsman-converters/lib/tuya';
import * as exposes from 'zigbee-herdsman-converters/lib/exposes';

const e = exposes.presets;
const ea = exposes.access;

// Lokal battery-parser för genPowerCfg-rapporter
const fzLocalBattery = {
    cluster: 'genPowerCfg',
    type: ['attributeReport', 'readResponse'],
    convert: (model, msg, publish, options, meta) => {
        const result = {};

        if (msg.data.batteryPercentageRemaining !== undefined) {
            // 0–200 där 200 = 100%
            result.battery = msg.data.batteryPercentageRemaining / 2;
        }

        return result;
    },
};

export default {
    fingerprint: [{modelID: 'ZG-303Z', manufacturerName: 'HOBEIAN'}],
    model: 'ZG-303Z',
    vendor: 'HOBEIAN',
    description: 'Soil moisture sensor (Tuya)',

    fromZigbee: [
        tuya.fz.datapoints,
        fzLocalBattery,
    ],
    toZigbee: [],

    onEvent: tuya.onEventSetTime,
    configure: tuya.configureMagicPacket,

    exposes: [
        e.battery(),
        e.temperature(),
        e.soil_moisture(),
    ],

    // Matchar exakt “options” du såg i utvecklarkonsolen
    options: [
        e.numeric('temperature_calibration', ea.SET).withValueStep(0.1),
        e.numeric('temperature_precision', ea.SET).withValueMin(0).withValueMax(3),
        e.numeric('soil_moisture_calibration', ea.SET).withValueStep(0.1),
        e.numeric('soil_moisture_precision', ea.SET).withValueMin(0).withValueMax(3),
    ],

    meta: {
        tuyaDatapoints: [
            [5, 'temperature', tuya.valueConverter.divideBy10],
            [109, 'soil_moisture', tuya.valueConverter.raw],
        ],
    },
};