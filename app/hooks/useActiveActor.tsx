
import { useContext, useEffect, useState } from 'react';

import ChimeSdkWrapper from '../chime/ChimeSdkWrapper';
import getChimeContext from '../context/getChimeContext';
import MessageType from '../types/MessageType';

export default function useActiveActorHook() {
    const chime: ChimeSdkWrapper | null = useContext(getChimeContext());
    const [activeActorAttendeeId, setActiveActorAttendeeId] = useState("");
    useEffect(() => {
        const callback = (message: MessageType) => {
            const { type, payload } = message;
            console.log(" --> Active message received: ", message);
            if (type === 'game_message' && payload.eventType === 'start_round') {
                setActiveActorAttendeeId(payload.actorId);
                console.log(" --> Active actor set to: ", payload.actorId);
            }
        };
        chime?.subscribeToMessageUpdate(callback);
        return () => {
            chime?.unsubscribeFromMessageUpdate(callback);
        };
    }, []);
    return activeActorAttendeeId;
}
