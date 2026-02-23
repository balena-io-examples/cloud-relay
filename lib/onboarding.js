import { PubSub } from '@google-cloud/pubsub';
import * as balenaEnv from '@balena/env-parsing';
import { fstat, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { get } from 'http';

const onboard = async function () {
	// fake env
	const gcpServiceAccountJson = JSON.parse(readFileSync(`.key.json`));
	process.env.GCP_PUBSUB_ONBOARDING_KEY = Buffer.from(
		JSON.stringify(gcpServiceAccountJson),
	).toString('base64');
	process.env.BALENA_APP_ID = 1916374;
	process.env.BALENA_DEVICE_UUID = 'fddff48c0b76735ce113439b0ce824e55';

	const pubSubProvisioningKey = balenaEnv.optionalVar(
		'GCP_PUBSUB_ONBOARDING_KEY',
		undefined,
	);

	if (pubSubProvisioningKey === undefined) {
		console.info(
			`Device has no pubSubProvisioningKey. Either the device has used it already and cleared it or it needs to be set`,
		);
		return;
	}

	const projectKeyObject = JSON.parse(
		new Buffer.from(pubSubProvisioningKey, 'base64'),
	);

	process.env.GOOGLE_APPLICATION_CREDENTIALS = `key.json`;
	// read base64 endcoded service account key, decode it and write it to the working dir.
	// let PubSub constructor pick up the key file
	await writeFileSync(
		process.env.GOOGLE_APPLICATION_CREDENTIALS,
		JSON.stringify(projectKeyObject, null, 2),
	);
	const pubsub = new PubSub();

	const fleetId = balenaEnv.requiredVar('BALENA_APP_ID').toString();
	const deviceUuid = balenaEnv.requiredVar('BALENA_DEVICE_UUID');

	const fleetIdTelemetryTopicName = `projects/${projectKeyObject.project_id}/topics/fleet-${fleetId}_device_${deviceUuid}_telemetry`;

	const topics = await pubsub.getTopics();

	// the fleetIdTelemetryTopicName is already registered, we don't have to do this
	const topicAlreadyExsits = topics.some(
		(t) =>
			t.some((tt) => tt.name === fleetIdTelemetryTopicName) ||
			t.name === fleetIdTelemetryTopicName,
	);

	if (topicAlreadyExsits) {
		return;
	}

	const fleetIdTelemetryTopic = pubsub.topic(fleetIdTelemetryTopicName);

	const fleetIdTelemetryTopicCreated = await fleetIdTelemetryTopic.create();
	// check if fleetId/telemetry is existing on pubsub
	// /pubsubpath/cloud-relay/<fleetId>/telemetry

	// create topic

	// pubsub.createTopic(`/cloud-relay/${fleetId}`, function(err, topic, apiResponse) {
	//     if (!err) {
	//       // The topic was created successfully.
	//     }
	//   });

	//   //-
	//   // If the callback is omitted, we'll return a Promise.
	//   //-
	//   pubsub.createTopic('my-new-topic').then(function(data) {
	//     const topic = data[0];
	//     const apiResponse = data[1];
	//   });

	// // check if device topic exits on pubsub
	// // /pubsubpath/cloud-relay/<fleetId>/<deviceUUID>/telemetry

	// // create device topic by uuid and fleet id on pubsub

	// // link device topic to the fleetid subscription

	// // Creates a client
	// const pubsub = new PubSub();

	// read base64 endcoded service account key, decode it and write it to the working dir.
	// let PubSub constructor pick up the key file
	await unlinkSync(GOOGLE_APPLICATION_CREDENTIALS);
};

onboard();
