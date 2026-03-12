#!/usr/bin/env node

import { setTimeout as delay } from 'node:timers/promises';

const ENDPOINT = 'https://na1-sandbox.api.commerce.adobe.com/NkZoCREALDbP4m7dczt5xA/graphql';
const ATTEMPTS = 5;
const DELAY_MS = 2000;

const requestBody = {
  query: `mutation {
  generateCustomerToken(
    email: "matt@adobedemo.com"
    password: "Password1"
  ) {
    token
  }
}`,
};

async function runAttempt(attemptNumber) {
  console.log(`\n=== Attempt ${attemptNumber}/${ATTEMPTS} ===`);

  const requestLog = {
    url: ENDPOINT,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: requestBody,
  };

  console.log('Full request:');
  console.log(JSON.stringify(requestLog, null, 2));

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: requestLog.headers,
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    let parsedResponse;

    try {
      parsedResponse = JSON.parse(responseText);
    } catch (parseError) {
      parsedResponse = {
        parseError: parseError.message,
        rawBody: responseText,
      };
    }

    console.log('Full response:');
    console.log(JSON.stringify({
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body: parsedResponse,
    }, null, 2));

    const token = parsedResponse?.data?.generateCustomerToken?.token;
    const errors = parsedResponse?.errors;

    if (token) {
      console.log(`Result: token returned (${token})`);
    } else {
      console.log('Result: error occurred or token missing');
      console.log(`HTTP status: ${response.status}`);
      console.log('Full error object:');
      console.log(JSON.stringify(errors ?? parsedResponse, null, 2));
    }
  } catch (error) {
    console.log('Result: request failed before a valid response was received');
    console.log('HTTP status: unavailable');
    console.log('Full error object:');
    console.log(JSON.stringify({
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause,
    }, null, 2));
  }
}

for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
  await runAttempt(attempt);

  if (attempt < ATTEMPTS) {
    console.log(`Waiting ${DELAY_MS}ms before next attempt...`);
    await delay(DELAY_MS);
  }
}
