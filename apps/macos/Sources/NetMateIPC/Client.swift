import Foundation
import Darwin
public enum IPCError: Error { case unavailable, invalidFrame, backend(String) }
public final class Client: @unchecked Sendable {
    private let socketDirectory:URL
    public init(directory:URL?=nil) { socketDirectory=directory ?? Self.directory }
    public static var directory: URL { if let value=ProcessInfo.processInfo.environment["NETMATE_DATA_DIR"] { return URL(fileURLWithPath:value) };return FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/NetMateNative") }
    private func connect() throws -> Int32 {
        let fd=socket(AF_UNIX,SOCK_STREAM,0);guard fd>=0 else {throw IPCError.unavailable};var noSigPipe:Int32=1;setsockopt(fd,SOL_SOCKET,SO_NOSIGPIPE,&noSigPipe,socklen_t(MemoryLayout<Int32>.size))
        var address=sockaddr_un();address.sun_len=UInt8(MemoryLayout<sockaddr_un>.size);address.sun_family=sa_family_t(AF_UNIX)
        let path=Array(socketDirectory.appendingPathComponent("agent.sock").path.utf8CString)
        guard path.count<=MemoryLayout.size(ofValue:address.sun_path) else {close(fd);throw IPCError.unavailable}
        withUnsafeMutableBytes(of:&address.sun_path){ destination in path.withUnsafeBytes{destination.copyBytes(from:$0)} }
        let result=withUnsafePointer(to:&address){ $0.withMemoryRebound(to:sockaddr.self,capacity:1){Darwin.connect(fd,$0,socklen_t(MemoryLayout<sockaddr_un>.size))} }
        guard result==0 else {close(fd);throw IPCError.unavailable};return fd
    }
    private func send(_ fd:Int32,_ bytes:Data) throws {try bytes.withUnsafeBytes{ buffer in var sent=0;while sent<bytes.count {let n=Darwin.send(fd,buffer.baseAddress!.advanced(by:sent),bytes.count-sent,0);guard n>0 else{throw IPCError.unavailable};sent+=n}}}
    private func read(_ fd:Int32,_ count:Int) throws -> Data {var data=Data(count:count);try data.withUnsafeMutableBytes{ buffer in var received=0;while received<count {let n=recv(fd,buffer.baseAddress!.advanced(by:received),count-received,0);guard n>0 else{throw IPCError.unavailable};received+=n}};return data}
    private func writeFrame(_ fd:Int32,_ command:[String:Any]) throws {let data=try JSONSerialization.data(withJSONObject:["version":1,"id":1,"command":command]);guard data.count<=2*1024*1024 else{throw IPCError.invalidFrame};var length=UInt32(data.count).bigEndian;try send(fd,Data(bytes:&length,count:4));try send(fd,data)}
    private func readFrame(_ fd:Int32) throws -> Any {let header=try read(fd,4);let size=header.reduce(UInt32(0)){($0<<8)|UInt32($1)};guard size>0 && size<=2*1024*1024 else{throw IPCError.invalidFrame};let data=try read(fd,Int(size));guard let response=try JSONSerialization.jsonObject(with:data) as? [String:Any],response["version"] as? Int==1 else{throw IPCError.invalidFrame};if let error=response["error"] as? String{throw IPCError.backend(error)};return response["result"] ?? NSNull()}
    public func request(_ op:String,_ args:Any?=nil) throws -> Any {
        var socketFD:Int32? = try? connect()
        if socketFD == nil {
            let executable=Bundle.main.executableURL!.deletingLastPathComponent().appendingPathComponent("netmate-agent")
            let process=Process();process.executableURL=executable;process.arguments=["--background"];try? process.run()
            for _ in 0..<50 {Thread.sleep(forTimeInterval:0.1);socketFD=try? connect();if socketFD != nil{break}}
        }
        guard let fd=socketFD else {throw IPCError.unavailable};defer{close(fd)};var timeout=timeval(tv_sec:30,tv_usec:0);setsockopt(fd,SOL_SOCKET,SO_RCVTIMEO,&timeout,socklen_t(MemoryLayout<timeval>.size));var command:[String:Any]=["op":op];if let args{command["args"]=args};try writeFrame(fd,command);return try readFrame(fd)}
    public func subscribe(_ receive:@escaping([String:Any])->Void) throws {let fd=try connect();defer{close(fd)};try writeFrame(fd,["op":"subscribe"]);while true{if let value=try readFrame(fd) as? [String:Any]{receive(value)}}}
}
