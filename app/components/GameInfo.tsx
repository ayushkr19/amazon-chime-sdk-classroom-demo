import React, { useCallback, useContext, useEffect, useState } from 'react';
import classNames from 'classnames/bind';
import styles from './GameInfo.css';

const cx = classNames.bind(styles);

type Props = {
    gameUid: string;
    roundNumber: number;
    adminId: string;
    currentMovieName: string;
    activeActorAttendeeId: string;
    attendeeIdState: string;
}

export default function GameInfo(props: Props) {
    const { gameUid, roundNumber, adminId, currentMovieName, activeActorAttendeeId, attendeeIdState} = props;

    // TOOD: Current movie name to be displayed only to the actor.
    return (
        <div>
            {/* {gameUid != undefined && gameUid.length > 0 &&
                <div className={cx('label')}>
                    <b>Game ID: </b> {gameUid}
                </div>
            } */}
            {roundNumber > 0 && 
            <div className={cx('label')}>
                <b>Round number: </b>{roundNumber}
            </div>
            }
            {/* {adminId != undefined && adminId.length > 0 &&
                <div className={cx('label')}>
                    <b>Admin: </b>{adminId}
                </div>
            } */}
            {
                activeActorAttendeeId != undefined && attendeeIdState != undefined && 
                activeActorAttendeeId.length > 0 && attendeeIdState === activeActorAttendeeId && 
                <div className={cx('label')}>
                    <b>Movie to be acted: </b>{currentMovieName}
                </div>
            }
        </div>
    )
}