// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
// var List = require("collections/list");
// var Map = require("collections/map");
const AWS = require('aws-sdk');

const ddb = new AWS.DynamoDB({ region: process.env.AWS_REGION });
const chime = new AWS.Chime({ region: 'us-east-1' });
chime.endpoint = new AWS.Endpoint(
  'https://service.chime.aws.amazon.com/console'
);
const { CONNECTIONS_TABLE_NAME } = process.env;
const { GAME_TABLE_NAME } = process.env;
const { ATTENDEES_TABLE_NAME } = process.env;

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
  var docClient = new AWS.DynamoDB.DocumentClient();
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

  console.log("Attendees: ", attendees)

  var movies = ["Haven", "LimeLight", "Parasite", "Fear", "Wings", "Argo",
    "Goodfellas", "Jumanji", "Frozen", "Skyfall", "Valentine", "Cube",
    "Suspicion"];

  //Start of Successful guess code
  if (data.type === "chat-message") {
    var gameUid = data.payload.gameUid;
    var movie = data.payload.movie;
    var guess = data.payload.message;
    var attendeeId = data.payload.attendeeId;

    if (guess.toUpperCase() === movie.toUpperCase()) {
      try {
        var score = await docClient
          .update({
            Key: {
              'GameId': gameUid,
              'AttendeeId': attendeeId,
            },
            UpdateExpression: "set Points = Points + :val",
            ExpressionAttributeValues: {
              ":val": 10
            },
            TableName: GAME_TABLE_NAME,
            ReturnValues: "UPDATED_NEW"
          })
          .promise();
      } catch (e) {
        return { statusCode: 500, body: e.stack };
      }
      data.type = "game_message";
      data.payload.message = "Successful Guess";
      data.payload.eventType = "successful_guess";
      postData = JSON.stringify(data);
    }
  } else if (data.type === "game_message") {

    //Start Game
    if (data.payload.eventType === "start_game") {

      var gameUid = data.payload.gameUid;
      var gameRoom = data.payload.gameRoom.toLowerCase();
      var gameRoomVal = (gameRoom).concat("/");
      var attendeeIdToNameMap = {};

      attendees.Items.map(async attendee => {
        var attendeeIdWithRoom = (gameRoomVal).concat(attendee.AttendeeId.S);
        console.log("Generated", attendeeIdWithRoom);
        try {
          var name = await ddb
            .query({
              ExpressionAttributeValues: {
                ':attendeeId': { S: attendeeIdWithRoom }
              },
              KeyConditionExpression: 'AttendeeId = :attendeeId',
              TableName: ATTENDEES_TABLE_NAME
            })
            .promise();
        } catch (e) {
          return { statusCode: 500, body: e.stack };
        }

        console.log("Results from DDB: ", name);
        console.log("Results from DDB items: ", name.Items);
        attendeeIdToNameMap[attendee.AttendeeId.S] = name.Items[0].Name.S;
      });

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
      var flag = 0;
      var actor = "";
      var count = -1;
      const dbCalls = attendees.Items.map(async record => {
        count++;
        const attendee = record.AttendeeId.S;
        if (flag === 0) {
          actor = attendee;
          flag++;
        }
        try {
          await ddb
            .putItem({
              TableName: GAME_TABLE_NAME,
              Item: {
                GameId: { S: gameUid },
                AttendeeId: { S: attendee },
                Movie: { S: movies[count] },
                Points: { N: "0" },
                TTL: { N: `${oneDayFromNow}` }
              }
            })
            .promise();
        } catch (err) {
          console.error(`error connecting: ${err.message}`);
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
      data.payload.message = "Let the game begin";
      data.payload.eventType = "start_round";
      data.payload.roundNumber = 1;
      data.payload.actor = actor;
      data.payload.movie = movies[0];
      data.payload.attendeeIdToName = attendeeIdToNameMap;
      postData = JSON.stringify(data);

      //End of Start Game
    } else if (data.payload.eventType === "end_round") {
      console.log("Running for end round");
      // do a DDB call to get who is next with gameId
      var gameUid = data.payload.gameUid;
      var attendeeIdToNameMap = data.payload.attendeeIdToName;

      // leaderboard code starts
      // we should get list of all gameUid matching
      // traverse through that list and check points corresponing and post the data
      console.log(" --> gameUid: ", gameUid);

      // const currentRecordOfGameUid = async() => {
      //   try {
      //     await docClient
      //       .query({
      //         ExpressionAttributeValues: {
      //           ':gameId': { S: gameUid }
      //         },
      //         KeyConditionExpression: 'GameId = :gameId',
      //         TableName: GAME_TABLE_NAME
      //       })
      //       .promise();
      //   } catch(e) {
      //       console.error("Error while trying to get leaderBoard for: ${gameUid}");
      //   }
      // }

      let currentRecordOfGameUid = {};
      try {
        currentRecordOfGameUid = await ddb
          .query({
            ExpressionAttributeValues: {
              ':gameId': { S: gameUid }
            },
            KeyConditionExpression: 'GameId = :gameId',
            TableName: GAME_TABLE_NAME
          })
          .promise();
      } catch (e) {
        return { statusCode: 500, body: e.stack };
      }

      console.log("Current record: ", currentRecordOfGameUid);
      console.log("Current record JSON: ", JSON.stringify(currentRecordOfGameUid));

      // list<map<string, string>>
      // var leaderBoard = new List();
      // var allAttendees = new List();
      var listLength = currentRecordOfGameUid.Items.length;
      console.log("List item length", listLength);
      var leaderBoard = {};
      var allAttendees = [];
      var allMovies = [];

      for (var i = 0; i < listLength; ++i) {
        var currentRecord = currentRecordOfGameUid.Items[i];
        console.log("-> currentRecord: ", currentRecord);
        console.log("-> attendeeIdToNameMap: ", attendeeIdToNameMap);
        var name = attendeeIdToNameMap[currentRecord.AttendeeId.S];
        console.log("-> name: ", name);
        leaderBoard[name] = currentRecord.Points.N;
        // var map = new Map.set(currentRecord.AttendeeId, currentRecord.Points);
        allAttendees.push(currentRecord.AttendeeId.S);
        allMovies.push(currentRecord.Movie.S);
        // allAttendees.add(currentRecord.AttendeeId);
        // leaderBoard.add(map);
      }

      console.log("All attendees: ", allAttendees);
      console.log("Leaderboard: ", leaderBoard);
      // dummy - data to test
      // leaderBoard.push(["player", "score"]);
      // leaderBoard.push(["player1", "score1"]);
      // get previous leaderBoard from currentLeaderBoard and build new one
      dataForFirstCall = data;
      dataForFirstCall.payload.message = JSON.stringify(leaderBoard);
      dataForFirstCall.type = "chat-message";
      console.log("Broadcasting previous round score as: " + JSON.stringify(dataForFirstCall));
      postDataLeaderBoard = JSON.stringify(dataForFirstCall);



      // post call for new leaderBoard
      // broadcast actual meessage
      // 2 calls for end round
      const postCalls = attendees.Items.map(async connection => {
        const connectionId = connection.ConnectionId.S;
        try {
          await apigwManagementApi
            .postToConnection({ ConnectionId: connectionId, Data: postDataLeaderBoard })
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



      // leaderboard code ends
      var previousRoundNumber = data.payload.roundNumber;
      console.log("Previous round number: ", previousRoundNumber);
      var currentRoundNumner = previousRoundNumber + 1;
      console.log("Current round number: ", currentRoundNumner);
      var numberOfMovies = movies.length;
      data.payload.message = "Let the new round begin";
      data.payload.eventType = "start_round";
      data.type = "game_message";
      data.payload.roundNumber = currentRoundNumner;
      data.payload.movie = allMovies[currentRoundNumner - 1];
      data.payload.actor = allAttendees[currentRoundNumner - 1];
      console.log("Braodcasing message to all for next round: " + JSON.stringify(data));
      postData = JSON.stringify(data);
    } else if (data.payload.eventType === "end_game") {
      // todo - implement, would be similar to round end
    }
    console.log("EndData : ", JSON.stringify(postData));
  }

  // function convertNestedArrayToString(array) {
  //   // let string = "";
  //   for (let item of array) {
  //     if (Array.isArray(item)) {
  //       // new line
  //       string += convertNestedArrayToString(item);
  //       string += "/n"
  //     }
  //     else {
  //       string += item;
  //       string += " /t ";
  //     }
  //   }
  //   return string;
  // }

  const postCallsForLeaderBoard = attendees.Items.map(async connection => {
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
    await Promise.all(postCallsForLeaderBoard);
  } catch (e) {
    console.error(`failed to post: ${e.message}`);
    return { statusCode: 500, body: e.stack };
  }
};
