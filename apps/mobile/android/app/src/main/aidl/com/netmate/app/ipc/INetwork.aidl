package com.netmate.app.ipc;
import com.netmate.app.ipc.IResult;
import com.netmate.app.ipc.IEvents;
interface INetwork {
    oneway void request(String message, IResult callback);
    oneway void subscribe(IEvents callback);
    oneway void unsubscribe(IEvents callback);
}
