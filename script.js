// This software includes the work that is distributed in the Apache License 2.0

'use strict';

const fs = require('fs');
const jwt = require('jsonwebtoken');
const mqtt = require('mqtt');
const exec = require('child_process').exec;

var argv = require(`yargs`)
  .options({
    projectId: {
      default: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT,
      description: 'The Project ID to use. Defaults to the value of the GCLOUD_PROJECT or GOOGLE_CLOUD_PROJECT environment variables.',
      requiresArg: true,
      type: 'string'
    },
    cloudRegion: {
      default: 'us-central1',
      description: 'GCP cloud region.',
      requiresArg: true,
      type: 'string'
    },
    registryId: {
      description: 'Cloud IoT registry ID.',
      requiresArg: true,
      demandOption: true,
      type: 'string'
    },
    deviceId: {
      description: 'Cloud IoT device ID.',
      requiresArg: true,
      demandOption: true,
      type: 'string'
    },
    privateKeyFile: {
      description: 'Path to private key file.',
      requiresArg: true,
      demandOption: true,
      type: 'string'
    },
    algorithm: {
      description: 'Encryption algorithm to generate the JWT.',
      requiresArg: true,
      demandOption: true,
      choices: ['RS256', 'ES256'],
      type: 'string'
    },
    mqttBridgeHostname: {
      default: 'mqtt.googleapis.com',
      description: 'MQTT bridge hostname.',
      requiresArg: true,
      type: 'string'
    },
    mqttBridgePort: {
      default: 8883,
      description: 'MQTT bridge port.',
      requiresArg: true,
      type: 'number'
    },
    messageType: {
      default: 'events',
      description: 'Message type to publish.',
      requiresArg: true,
      choices: ['events', 'state'],
      type: 'string'
    }
  })
  .example(`node $0 cloudiot_mqtt_example_nodejs.js --projectId=blue-jet-123 \\\n\t--registryId=my-registry --deviceId=my-node-device \\\n\t--privateKeyFile=../rsa_private.pem --algorithm=RS256 \\\n\t --cloudRegion=us-central1`)
  .wrap(120)
  .recommendCommands()
  .epilogue(`For more information, see https://cloud.google.com/iot-core/docs`)
  .help()
  .strict()
  .argv;

function createJwt (projectId, privateKeyFile, algorithm) {
  const token = {
    'iat': parseInt(Date.now() / 1000),
    'exp': parseInt(Date.now() / 1000) + 20 * 60, // 20 minutes
    'aud': projectId
  };
  const privateKey = fs.readFileSync(privateKeyFile);
  return jwt.sign(token, privateKey, { algorithm: algorithm });
}

const mqttClientId = `projects/${argv.projectId}/locations/${argv.cloudRegion}/registries/${argv.registryId}/devices/${argv.deviceId}`;
const mqttTopic = `/devices/${argv.deviceId}/${argv.messageType}`;

let connectionArgs = {
  host: argv.mqttBridgeHostname,
  port: argv.mqttBridgePort,
  clientId: mqttClientId,
  username: 'unused',
  password: createJwt(argv.projectId, argv.privateKeyFile, argv.algorithm),
  protocol: 'mqtts',
  secureProtocol: 'TLSv1_2_method'
};

let client = mqtt.connect(connectionArgs);
client.subscribe(`/devices/${argv.deviceId}/config`);

client.on('connect', (success) => {
  console.log('connect');
  if (!success) {
    console.log('Client not connected...');
  } else {
    setInterval(() => {
      exec('python ./pythin-grovepi/script.py', (error, stdout, stderr) => {
        if (error !== null) {
          console.log('exec error: ' + error);
          return
        }
        var data = stdout.replace(/\r?\n/g,"");
        var datas = data.split(",")
        var record = {
          registryid: argv.registryId,
          deviceid: argv.deviceId,
          timestamp: datas[0],
          temperature: Number(datas[1]),
          humidity: Number(datas[2]),
          moisture: Number(datas[3]),
          light: Number(datas[4]),
        };
        const payload = JSON.stringify(record);
        console.log("Publish: " + payload);
        client.publish(mqttTopic, payload, { qos: 1 }, (err) => {
          if (!err) {
            console.log('Publish sucess');
          } else {
            console.log('Publish error', err);
          }
        });
      });
    }, 300000);
  }
});

client.on('close', () => {
  console.log('close');
});

client.on('error', (err) => {
  console.log('error', err);
});

client.on('message', (topic, message, packet) => {
  console.log('message received: ', Buffer.from(message, 'base64').toString('ascii'));
});

client.on('packetsend', () => {
  // Note: logging packet send is very verbose
});

