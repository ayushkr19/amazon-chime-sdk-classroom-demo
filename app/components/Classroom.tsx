// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import classNames from 'classnames/bind';
import { ipcRenderer, remote } from 'electron';
import React, { useCallback, useContext, useEffect, useState } from 'react';
import { FormattedMessage } from 'react-intl';
import Modal from 'react-modal';

import ChimeSdkWrapper from '../chime/ChimeSdkWrapper';
import getChimeContext from '../context/getChimeContext';
import getMeetingStatusContext from '../context/getMeetingStatusContext';
import getUIStateContext from '../context/getUIStateContext';
import ClassMode from '../enums/ClassMode';
import MeetingStatus from '../enums/MeetingStatus';
import ViewMode from '../enums/ViewMode';
import Chat from './Chat';
import styles from './Classroom.css';
import ContentVideo from './ContentVideo';
import Controls from './Controls';
import DeviceSwitcher from './DeviceSwitcher';
import Error from './Error';
import LoadingSpinner from './LoadingSpinner';
import LocalVideo from './LocalVideo';
import RemoteVideoGroup from './RemoteVideoGroup';
import Roster from './Roster';
import ScreenPicker from './ScreenPicker';
import ScreenShareHeader from './ScreenShareHeader';
import Timer from './Timer';
import uuid from '../utils/getUid';
import MessageType from '../types/MessageType';
import GameInfo from './GameInfo';
import useActiveActorHook from '../hooks/useActiveActor';

const cx = classNames.bind(styles);

export default function Classroom() {
  Modal.setAppElement('body');
  const chime: ChimeSdkWrapper | null = useContext(getChimeContext());
  const [state] = useContext(getUIStateContext());
  const { meetingStatus, errorMessage } = useContext(getMeetingStatusContext());
  const [isContentShareEnabled, setIsContentShareEnabled] = useState(false);
  const [viewMode, setViewMode] = useState(ViewMode.Room);
  const [isModeTransitioning, setIsModeTransitioning] = useState(false);
  const [isPickerEnabled, setIsPickerEnabled] = useState(false);
  const [gameUid, setGameUid] = useState("");
  const [roundNumber, setRoundNumber] = useState(0);
  const [adminId, setAdminId] = useState("");
  const [currentMovieName, setCurrentMovieName] = useState("");
  const [activeActorAttendeeId, setActiveActorAttendeeId] = useState("");
  const [attendeeIdState, setAttendeeIdState] = useState("");

  const onClickGameModeButton = () => {
    console.log("On click game mode");
    const attendeeId = chime?.configuration?.credentials?.attendeeId;
    if (attendeeId) {
      setAttendeeIdState(attendeeId);
      var newGameId = uuid();
      if (gameUid.length === 0) {
        // Start game only if a game Id already doesn't exist.
        chime?.sendMessage('game_message', {
          attendeeId,
          message: "Start game bro.",
          eventType: "start_game",
          gameUid: newGameId,
          adminId: attendeeId
        });
        setGameUid(newGameId);
      }

      // Start round TODO: This is only for testing right now.
      // chime?.sendMessage('game_message', {
      //   attendeeId,
      //   message: "Start round bro.",
      //   eventType: "start_round",
      //   actorId: attendeeId,
      //   roundNumber: 1
      // });
    }
  }

  const onGameMessageReceived = (message: MessageType) => {
    console.log("On game message received: ", message);

    if (message.payload.eventType === 'start_game') {
      // TODO: We will not get this message anytime. So remove all logic from here.
      // Set game uid
      // let newGameUid = message.payload.gameUid;
      // setGameUid(newGameUid);

      // Need to set adminId here as well, so that cna trigger round end through admin's timer expiry.
      // setAdminId(message.payload.adminId);
      
      // Change backgrounds, or any UI changes can be implemented here.
    } else if (message.payload.eventType === 'start_round') {
      // Set the round number in the state.
      setRoundNumber(message.payload.roundNumber);

      if (adminId.length === 0) {
        setAdminId(message.payload.adminId);
      }

      // If attendeeId state is not already set, then set it to Classroom's state
      var actualAttendeeId = chime?.configuration?.credentials?.attendeeId;
      if (attendeeIdState.length === 0 && actualAttendeeId != undefined && actualAttendeeId != null) {
        setAttendeeIdState(actualAttendeeId);
      }

      // If gameUid is not already set, then set the GameUid.
      if (gameUid.length === 0) {
        setGameUid(message.payload.gameUid);
      }

      // Highlight actor in Roster.
      // This is being done in useActiveActor.tsx hook now.
      // Setting the active actor in Classroom's state.
      setActiveActorAttendeeId(message.payload.actor);

      // Mute if we are the actor.
      const attendeeId = chime?.configuration?.credentials?.attendeeId;
      if (attendeeId === message.payload.actor) {
        // Mute
        console.log("Muting audio locally as we are the actor");
        chime?.audioVideo?.realtimeMuteLocalAudio();
      }

      // Reset timer and start counting down.
      // This is already implemented in Timer.tsx.

      // TODO: Show movie name only to the actor.
      setCurrentMovieName(message.payload.movie);

    } else if (message.payload.eventType === 'end_round') {
      // Show people who guessed correctly.

      // Show leaderboard.
    } else if (message.payload.eventType === 'end_game') {
      // Show winners.

      // Show leaderboard.
    } else if (message.payload.eventType === 'successful_guess') {
      console.log("Successful guess by ", message);
    }
  }

  const stopContentShare = async () => {
    setIsModeTransitioning(true);
    await new Promise(resolve => setTimeout(resolve, 200));
    ipcRenderer.on('chime-disable-screen-share-mode-ack', () => {
      try {
        chime?.audioVideo?.stopContentShare();
      } catch (error) {
        // eslint-disable-next-line
        console.error(error);
      } finally {
        setViewMode(ViewMode.Room);
        setIsModeTransitioning(false);
      }
    });
    ipcRenderer.send('chime-disable-screen-share-mode');
  };

  // Must pass a memoized callback to the ContentVideo component using useCallback().
  // ContentVideo will re-render only when one dependency "viewMode" changes.
  // See more comments in ContentVideo.
  const onContentShareEnabled = useCallback(
    async (enabled: boolean) => {
      if (enabled && viewMode === ViewMode.ScreenShare) {
        await stopContentShare();
      }
      setIsContentShareEnabled(enabled);
    },
    [viewMode]
  );

  if (process.env.NODE_ENV === 'production') {
    useEffect(() => {
      // Recommend using "onbeforeunload" over "addEventListener"
      window.onbeforeunload = async (event: BeforeUnloadEvent) => {
        // Prevent the window from closing immediately
        // eslint-disable-next-line
        event.returnValue = true;
        try {
          await chime?.leaveRoom(state.classMode === ClassMode.Teacher);
        } catch (error) {
          // eslint-disable-next-line
          console.error(error);
        } finally {
          window.onbeforeunload = null;
          remote.app.quit();
        }
      };
      return () => {
        window.onbeforeunload = null;
      };
    }, []);
  }

  return (
    <div
      className={cx('classroom', {
        roomMode: viewMode === ViewMode.Room,
        screenShareMode: viewMode === ViewMode.ScreenShare,
        isModeTransitioning,
        isContentShareEnabled
      })}
    >
      {meetingStatus === MeetingStatus.Loading && <LoadingSpinner />}
      {meetingStatus === MeetingStatus.Failed && (
        <Error errorMessage={errorMessage} />
      )}
      {meetingStatus === MeetingStatus.Succeeded && (
        <>
          <>
            <div className={cx('left')}>
              {viewMode === ViewMode.ScreenShare && (
                <ScreenShareHeader onClickStopButton={stopContentShare} />
              )}
              <div className={cx('contentVideoWrapper')}>
                <ContentVideo onContentShareEnabled={onContentShareEnabled} />
              </div>
              <div className={cx('remoteVideoGroupWrapper')}>
                <RemoteVideoGroup
                  viewMode={viewMode}
                  isContentShareEnabled={isContentShareEnabled}
                />
              </div>
              <div className={cx('localVideoWrapper')}>
                <div className={cx('controls')}>
                  <Controls
                    viewMode={viewMode}
                    onClickShareButton={() => {
                      setIsPickerEnabled(true);
                    }}
                    onClickGameModeButton={onClickGameModeButton}
                  />
                </div>
                <div className={cx('localVideo')}>
                  <LocalVideo />
                </div>
              </div>
            </div>
            <div className={cx('right')}>
              <div className={cx('titleWrapper')}>
                <div className={cx('title')}>{chime?.title}</div>
                <div className={cx('label')}>
                  <GameInfo gameUid={gameUid} roundNumber={roundNumber} adminId={adminId} currentMovieName={currentMovieName} 
                  activeActorAttendeeId={activeActorAttendeeId} attendeeIdState={attendeeIdState} />
                </div>

                <div className={cx('label')}>
                  <Timer adminId={adminId}/>
                </div>
              </div>
              <div className={cx('deviceSwitcher')}>
                <DeviceSwitcher />
              </div>
              <div className={cx('roster')}>
                <Roster activeActorAttendeeId={activeActorAttendeeId} />
              </div>
              <div className={cx('chat')}>
                <Chat onGameMessageReceived={onGameMessageReceived} gameUid={gameUid} currentMovieName={currentMovieName} roundNumber={roundNumber} />
              </div>
            </div>
          </>
          <Modal
            isOpen={isPickerEnabled}
            contentLabel="Screen picker"
            className={cx('modal')}
            overlayClassName={cx('modalOverlay')}
            onRequestClose={() => {
              setIsPickerEnabled(false);
            }}
          >
            <ScreenPicker
              onClickShareButton={async (selectedSourceId: string) => {
                setIsModeTransitioning(true);
                await new Promise(resolve => setTimeout(resolve, 200));
                ipcRenderer.on(
                  'chime-enable-screen-share-mode-ack',
                  async () => {
                    try {
                      setIsPickerEnabled(false);
                      await chime?.audioVideo?.startContentShareFromScreenCapture(
                        selectedSourceId
                      );
                      setViewMode(ViewMode.ScreenShare);
                      setIsModeTransitioning(false);
                    } catch (error) {
                      // eslint-disable-next-line
                      console.error(error);
                      await stopContentShare();
                    }
                  }
                );
                ipcRenderer.send('chime-enable-screen-share-mode');
              }}
              onClickCancelButton={() => {
                setIsPickerEnabled(false);
              }}
            />
          </Modal>
        </>
      )}
    </div>
  );
}
