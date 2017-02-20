module.exports={
	isLocal: true
	, isDemo: false
	, database: "AXtime_RM" // AXtime_RM
	, port: 80
	, hardware: {
		 enabled: true //true or false
		, interfaceType: "JaCircuitsChrono"  // JaCircuitsNormal, JaCircuitsChrono,TlinkDirect,Debug
		, comPort: "COM3" // COM1-7 for Windows , /dev/cu.usbserial for OSX
		, liveEventId: ""
		, splitCount: 0 // change this value to the number of split eyes you have on course (we only handle 1 right now)
		, displayHardware: "" //RA6X80
		}
	, liveEventId: ""
	, debug: false
	, cloudKey: "UNrpmCiHax1H5vFiDdnlbcgeLoxtv52o"
	, rmLiveUrl: "http://live.axti.me"
}