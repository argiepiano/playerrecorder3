// Object to hold all the incoming MIDI data. Includes methods for playing, recording and encoding SMF

function RecorderObject(targetID) {   // DOM element ID where recorder UI lives
  console.log("Creating new object for ID "+targetID);
  var eventObjects = [];
  var recStartTime = 0, rAF;
  var self = this;
  
  var target = $(targetID);
  
  this.startRecording =  function () {
    self.stopRecording();
  	console.log("Starting recording");
  	target.trigger('state:recording')
  	eventObjects = [];
    midiInput.onmidimessage = self.onMidiMessage; // attaches a listener to the midi input
    recStartTime = performance.now();
  }
  
  this.stopRecording =  function () {
    console.log("Stopping recording");
    target.trigger("state:idle");
    midiInput.onmidimessage = null;
    window.cancelAnimationFrame(rAF);
    reset = [176, 123, 0]; // resets midi devices. Kills stuck sounds, etc.
    setTimeout(function() {midiOutput&&midiOutput.send(reset)}, 350);	
  }
  
  this.playEvents =  function () {
    internalStop();
    curTime = performance.now();
    console.log("Playing...");
    target.trigger("state:playing");
    var eventPointer = 0;
    var startTime = performance.now(); // stores the moment when the player is started.
    rAF = window.requestAnimationFrame(
      function queueEvents(timeStamp) {
	// This next 'while' schedules the events supposed to run only between NOW and 150 microseconds later. This is done so that the player
	// can be stopped or tempo can be changed. see http://www.html5rocks.com/en/tutorials/audio/scheduling/
        while (eventPointer<eventObjects.length && eventObjects[eventPointer].receivedTime < (timeStamp - startTime) + 150) {
          midiOutput&&midiOutput.send(eventObjects[eventPointer].data, startTime+eventObjects[eventPointer].receivedTime);
          eventPointer++;
        }
        if (eventPointer<eventObjects.length) {
          rAF = window.requestAnimationFrame(queueEvents); // this runs the function queueEvents and sends a timestamp in microseconds as an argument.
        } else {
          self.stopRecording();
        }
      });
  }
  
  function internalStop() {  // stop without triggering stop event
      window.cancelAnimationFrame(rAF);
      reset = [176, 123, 0];
      midiOutput&&midiOutput.send(reset);	
  }
  
  this.onMidiMessage = function (receivedEvent) {
    if ((event.data[0] & 0xf0) != 0xF0) {
	eventObjects.push({data: receivedEvent.data, receivedTime: receivedEvent.receivedTime - recStartTime});
    }
  }
  this.createMIDIfile = function(){
//    console.log(eventObjects);
    var myMFile = [], myMTrack = []
    myMFile = myMFile.concat(createMIDIheader()); // Add header to file
    var encodedTrackArray = encodeMIDIevents(); // Encode events
    myMTrack = createTrackheader(encodedTrackArray); // Add header to track, including length
    myMTrack = myMTrack.concat(encodedTrackArray); // concat track header and encoded events
    myMFile = myMFile.concat(createTempoTrack()); //add empty tempo track. All SMF type 1 need Track 1 as tempo track
    myMFile = myMFile.concat(myMTrack); // add track to file
    // console.log(myMFile);
    // Get ready to save!
    var data = new Uint8Array(myMFile); // create typed array
    var blob = new Blob( [data], { type: "application/x-midi"});  // create file/blob
    var blobURL = URL.createObjectURL(blob); // URL of blob
    var save = document.createElement('a'); // and save
    save.href = blobURL;
    save.download = 'bfile.mid';
    save.click();
    URL.revokeObjectURL(save.href);
  }
  
  
  function encodeMIDIevents(){  // encodes a MIDI file
    var track = [];
    var previousTime = 0.0;
    var delta;
    for (var i = 0; i<eventObjects.length; i++ ) {
      // Each midi clock is 2.6041 milliseconds at 120 quarter notes per minute, using 192 MIDI clocks per quarter note (500 ms / 192 - 2.6041 ms
      // per MIDI clock ).
      delta = Math.round((eventObjects[i].receivedTime - previousTime) / 2.6041); // delta time measured in number of MIDI clocks
      previousTime = eventObjects[i].receivedTime;
      
      // calculate Variable Length bytes. see http://www.ccarh.org/courses/253/handout/vlv/
      if(delta >>> 21) {
        track.push(((delta >>> 21) & 0x7F) | 0x80);
      } 
      if(delta >>> 14) {
        track.push(((delta >>> 14) & 0x7F) | 0x80);
      }
      if(delta >>> 7) {
        track.push(((delta >>> 7) & 0x7F) | 0x80);
      }
      track.push((delta & 0x7F));
      
      if (eventObjects[i].data[0] != null) track.push(eventObjects[i].data[0]);
      if (eventObjects[i].data[1] != null) track.push(eventObjects[i].data[1]);     
      if (eventObjects[i].data[2] != null) track.push(eventObjects[i].data[2]);
    }
    // Adding the track end event
    track.push(0x00); track.push(0xFF); track.push(0x2F); track.push(0x00);
    console.log(track);
    return track;
  }
  
  function createMIDIheader() {
    var chunkType = [77, 84, 104, 100]; // MThd
    var chunkLength = [0,0,0,6]; // 6 bytes
    var format = [0,1]; // SMF type 1 (multitrack)
    var ntrks = [0, 2]; // Two tracks - first track is an empty tempo track
    var division = [0, 192]; // 192 ticks per beat
    return chunkType.concat(chunkLength,format,ntrks,division);
  }
  
  function createTrackheader(track) {
    var chunkType = [77, 84, 114, 107 ]; // MTrk
    var chunkLength = extractFourBytes(track.length);
    return chunkType.concat(chunkLength)
  }
  
  function createTempoTrack() {
    return [77, 84, 114, 107, 0, 0, 0, 4, 0, 255, 47, 0]; // MTrk  plus other header bytes for an empty tempo track.
  }
  
  /*
   * Helper function
   * Returns an array of 4 bytes from the value passed
   */
  
  function extractFourBytes(dec) {
    var hexaValue = dec.toString(16);
    hexaValue = "00000000" + hexaValue;
    hexaValue = hexaValue.substring(hexaValue.length-8);
    // console.log(hexaValue);
    var a = [], num, theByte;
    for (i=0; i<8; i += 2) {
      theByte = hexaValue.substring(i, i+2);
      // console.log(theByte);
      num = parseInt(theByte,16);
      a.push(num);
    }
    // console.log(a)
    return a;
  }

}


