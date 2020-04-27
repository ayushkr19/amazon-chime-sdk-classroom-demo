// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const AWS = require('aws-sdk');

const ddb = new AWS.DynamoDB({ region: process.env.AWS_REGION });
const chime = new AWS.Chime({ region: 'us-east-1' });
chime.endpoint = new AWS.Endpoint(
  'https://service.chime.aws.amazon.com/console'
);
const { CONNECTIONS_TABLE_NAME } = process.env;
const { GAME_TABLE_NAME } = process.env;
const strictVerify = true;

exports.authorize = async (event, context, callback) => {
  console.log('authorize event:', JSON.stringify(event, null, 2));
  const generatePolicy = (principalId, effect, resource, context) => {
    const authResponse = {};
    authResponse.principalId = principalId;
    if (effect && resource) {
      const policyDocument = {};
      policyDocument.Version = '2012-10-17';
      policyDocument.Statement = [];
      const statementOne = {};
      statementOne.Action = 'execute-api:Invoke';
      statementOne.Effect = effect;
      statementOne.Resource = resource;
      policyDocument.Statement[0] = statementOne;
      authResponse.policyDocument = policyDocument;
    }
    authResponse.context = context;
    return authResponse;
  };
  let passedAuthCheck = false;
  if (
    !!event.queryStringParameters.MeetingId &&
    !!event.queryStringParameters.AttendeeId &&
    !!event.queryStringParameters.JoinToken
  ) {
    try {
      attendeeInfo = await chime
        .getAttendee({
          MeetingId: event.queryStringParameters.MeetingId,
          AttendeeId: event.queryStringParameters.AttendeeId
        })
        .promise();
      if (
        attendeeInfo.Attendee.JoinToken ===
        event.queryStringParameters.JoinToken
      ) {
        passedAuthCheck = true;
      } else if (strictVerify) {
        console.error('failed to authenticate with join token');
      } else {
        passedAuthCheck = true;
        console.warn(
          'failed to authenticate with join token (skipping due to strictVerify=false)'
        );
      }
    } catch (e) {
      if (strictVerify) {
        console.error(`failed to authenticate with join token: ${e.message}`);
      } else {
        passedAuthCheck = true;
        console.warn(
          `failed to authenticate with join token (skipping due to strictVerify=false): ${e.message}`
        );
      }
    }
  } else {
    console.error('missing MeetingId, AttendeeId, JoinToken parameters');
  }
  return generatePolicy(
    'me',
    passedAuthCheck ? 'Allow' : 'Deny',
    event.methodArn,
    {
      MeetingId: event.queryStringParameters.MeetingId,
      AttendeeId: event.queryStringParameters.AttendeeId
    }
  );
};

exports.onconnect = async event => {
  console.log('onconnect event:', JSON.stringify(event, null, 2));
  const oneDayFromNow = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
  try {
    await ddb
      .putItem({
        TableName: process.env.CONNECTIONS_TABLE_NAME,
        Item: {
          MeetingId: { S: event.requestContext.authorizer.MeetingId },
          AttendeeId: { S: event.requestContext.authorizer.AttendeeId },
          ConnectionId: { S: event.requestContext.connectionId },
          TTL: { N: `${oneDayFromNow}` }
        }
      })
      .promise();
  } catch (e) {
    console.error(`error connecting: ${e.message}`);
    return {
      statusCode: 500,
      body: `Failed to connect: ${JSON.stringify(err)}`
    };
  }
  return { statusCode: 200, body: 'Connected.' };
};

exports.ondisconnect = async event => {
  console.log('ondisconnect event:', JSON.stringify(event, null, 2));
  try {
    await ddb
      .delete({
        TableName: process.env.CONNECTIONS_TABLE_NAME,
        Key: {
          MeetingId: event.requestContext.authorizer.MeetingId,
          AttendeeId: event.requestContext.authorizer.AttendeeId
        }
      })
      .promise();
  } catch (err) {
    return {
      statusCode: 500,
      body: `Failed to disconnect: ${JSON.stringify(err)}`
    };
  }
  return { statusCode: 200, body: 'Disconnected.' };
};

exports.sendmessage = async event => {
  const oneDayFromNow = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
  console.log('sendmessage event:', JSON.stringify(event, null, 2));
  let attendees = {};
  try {
    attendees = await ddb
      .query({
        ExpressionAttributeValues: {
          ':meetingId': { S: event.requestContext.authorizer.MeetingId }
        },
        KeyConditionExpression: 'MeetingId = :meetingId',
        TableName: CONNECTIONS_TABLE_NAME
      })
      .promise();
  } catch (e) {
    return { statusCode: 500, body: e.stack };
  }
  const apigwManagementApi = new AWS.ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint: `${event.requestContext.domainName}/${event.requestContext.stage}`
  });
  
  var postData = JSON.parse(event.body).data;
  
  var data = JSON.parse(JSON.parse(event.body).data);
  
  console.log(attendees.Items.length);
  console.log(attendees);
  for (var i = 0; i < attendees.Items.length; i++) {
    console.log(attendees.Items[i].AttendeeId);
  }

  var movies = ["Haven", "LimeLight", "Parasite", "Fear", "Wings", "Argo", 
  "Goodfellas", "Jumanji", "Frozen", "Skyfall", "Valentine", "Cube", 
  "Suspicion"];
  
  if(data.type === "game_message") {
    console.log("game_message");


    //Start Game
    if(data.payload.eventType === "start_game") {
      
      var gameUid = data.payload.gameUid;
      
      //Shuffle Movies Array
      var currentIndex = movies.length, temporaryValue, randomIndex;
      while (0 !== currentIndex) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;
        temporaryValue = movies[currentIndex];
        movies[currentIndex] = movies[randomIndex];
        movies[randomIndex] = temporaryValue;
      }        
      
      //Initialize the db with the game details
      const dbCalls = attendees.Items.map(async record => {
        const attendee = record.AttendeeId.S;
         try {
            await ddb
              .putItem({
                TableName: GAME_TABLE_NAME,
                Item: {
                  GameId: { S: gameUid },
                  AttendeeId: { S: attendee },
                  Movie: { S: movies[i]},
                  Points: { N: "0"},
                  TTL: { N: `${oneDayFromNow}` }
                }
              })
              .promise();
          } catch (e) {
            console.error(`error connecting: ${e.message}`);
            return {
              statusCode: 500,
              body: `Failed to connect: ${JSON.stringify(err)}`
            };
        }
      });
      try {
        await Promise.all(dbCalls);
      } catch (e) {
        console.error(`failed to post: ${e.message}`);
        return { statusCode: 500, body: e.stack };
     }
     data.payload.message="Let the game begin";
     data.payload.eventType="start_round";
     data.payload.roundNumber = 1;
     postData = data;
    }
    //End of Start Game



    console.log("EndData : ", JSON.stringify(postData));
  }
  
  
  
  const postCalls = attendees.Items.map(async connection => {
    const connectionId = connection.ConnectionId.S;
    try {
      await apigwManagementApi
        .postToConnection({ ConnectionId: connectionId, Data: postData })
        .promise();
    } catch (e) {
      if (e.statusCode === 410) {
        console.log(`found stale connection, skipping ${connectionId}`);
      } else {
        console.error(
          `error posting to connection ${connectionId}: ${e.message}`
        );
      }
    }
  });
  try {
    await Promise.all(postCalls);
  } catch (e) {
    console.error(`failed to post: ${e.message}`);
    return { statusCode: 500, body: e.stack };
  }
  return { statusCode: 200, body: 'Data sent.' };
};
