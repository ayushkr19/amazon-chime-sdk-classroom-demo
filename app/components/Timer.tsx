import React, { useCallback, useContext, useEffect, useState } from 'react';
import { FormattedMessage } from 'react-intl';
import ChimeSdkWrapper from '../chime/ChimeSdkWrapper';
import getChimeContext from '../context/getChimeContext';
import MessageType from '../types/MessageType';
import moment from 'moment';
import styles from './Timer.css';
import classNames from 'classnames/bind';

type Props = {
    adminId: string;
    gameUid: string;
    roundNumber: number;
    attendeeIdToName: Object;
}

const cx = classNames.bind(styles);

export default function Timer(props: Props) {
    const { adminId , gameUid, roundNumber, attendeeIdToName} = props;
    const [time, setTime] = useState(20);
    const chime: ChimeSdkWrapper | null = useContext(getChimeContext());
    const [showTimer, setShowTimer] = useState(false);

    const calculateTimeLeft = () => {
        if (time > 0) {
            return time - 1;
        } else {
            // Timer expired. Send message if admin.
            console.log("In else block, sending round end message. AdminId: ", adminId);
            const attendeeId = chime?.configuration?.credentials?.attendeeId;
            if (adminId === attendeeId) {
                console.log("AdminId equal to attendee id");
                chime?.sendMessage('game_message', {
                    attendeeId,
                    message: "End round bro.",
                    eventType: "end_round", 
                    roundNumber: roundNumber,
                    gameUid: gameUid,
                    adminId: adminId,
                    attendeeIdToName: attendeeIdToName
                });
            }
        }
        return time;
    }

    const resetTime = () => {
        setTime(20);
    }

    useEffect(() => {
        const timer = setTimeout(() => {
            setTime(calculateTimeLeft());
        }, 1000);
        return () => clearTimeout(timer);
    });

    useEffect(() => {
        const callback = (message: MessageType) => {
            const { type, payload } = message;
            if (type === 'game_message' && payload.eventType === 'start_round') {
                setShowTimer(true);
                resetTime();
            } else if (type === 'game_message' && payload.eventType === 'end_game') {
                setShowTimer(false);
                setTime(-1);
            }
        };
        chime?.subscribeToMessageUpdate(callback);
        return () => {
            chime?.unsubscribeFromMessageUpdate(callback);
        };
    }, []);

    if (showTimer) {
        return (
            <div className={(time <= 10 && time != 0) ? cx('lastTick') : cx('normalTick')}>
                {moment(time*1000).utc().format('mm:ss')} time left
            </div>
        );
    }
    else {
        return (
            <div className={cx('initialDisplay')}> 
                {/* Any String can be added here */}
                Timer ⏲️ ticks here !
            </div>
        );
    }
}