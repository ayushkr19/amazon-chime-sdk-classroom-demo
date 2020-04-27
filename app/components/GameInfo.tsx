import React, { useCallback, useContext, useEffect, useState } from 'react';
import classNames from 'classnames/bind';
import styles from './GameInfo.css';

const cx = classNames.bind(styles);

type Props = {
    gameUid: string;
    roundNumber: number;
    adminId: string
}

export default function GameInfo(props: Props) {
    const {gameUid, roundNumber, adminId} = props;

    return (
        <div>
            {gameUid.length > 0 &&
                <div className={cx('label')}>
                    <b>Game ID: </b> {gameUid}
                </div>
            }
            {roundNumber > 0 && 
            <div className={cx('label')}>
                <b>Round number: </b>{roundNumber}
            </div>
            }
            {adminId.length > 0 &&
                <div className={cx('label')}>
                    <b>Admin: </b>{adminId}
                </div>
            }
        </div>
    )
}