/***********************************************************************
(c) Copyright 2021 by Stefano Marina.

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject
to the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR
ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
**********************************************************************/

var exports = module.exports = {};

/**
 * Filters are used to check if a midi message is required to be converted
 * to OSC or shell messages.
 * They are built upon json objects from json configuration.
 * Note that a filter in itself does not check if shell mode is disabled,
 * this is done through the FilterMap object initialization. custom Filter
 * handling should be considering this.
 */
exports.Filter = class {
  /**
   * Filter constructor
   * channel must be "all" or a number between 1 and 16.
   * config is an object built from json configuration.
   */
  constructor(channel, configuration) {
    
    this.config = configuration;
    
    if (isNaN(channel))
      this.channel = "all";
    else
      this.channel = channel;
    
    // Status byte - this is where channel matters
    this.status = [];
    let bStatus = 0;
      
    if (undefined !== this.config.cc) {
      bStatus = 176;
      this.data1 = Number(configuration.cc);
    } else if (undefined !== this.config.note) {
      bStatus = 144;
      this.data1 = Number(configuration.note);
    } else
      throw "Filter has no cc or noteon event";
    
    if (this.channel == "all") {
      let bMax = bStatus+16;
        do {this.status.push(bStatus++)} while (bStatus < bMax);
    } else
      this.status.push(bStatus + (Number(this.channel)-1));
    
    // data1 byte - this is used for cc / note number
    
    // data2 byte - this will be filtered if a fader is used instead of a trigger.
    if (undefined !== this.config.trigger) {
      this.cutoff = this.config.trigger;
      this.mode = "trigger";
    } else if (undefined !== this.config.fader) {  
      this.cutoff = 0;
      this.mode = this.config.fader;
    } else if (undefined !== this.config.selector) {
      this.mode = "selector";
    }
    
    if (configuration.osc !== undefined) {
      this.outcome = { "type" : "osc" , "path" : configuration.osc };
    } else { 
      this.outcome = { "type" : "command" , "path" : this.config.command };
    }
    
    this.replaceMode = this.outcome.path.indexOf(" % ") !== -1;
  }
  
  /**
   * tells if a message would trigger a process.
   * @return true if the midi message is accepted
   */
  accepts(midiMessage) {
    return (this.status.indexOf(midiMessage[0]) >= 0 
              && (this.data1 == midiMessage[1])
              && ( (this.mode == "trigger")
                    ? (midiMessage[2] == this.cutoff)
                    : true
                 )
              && ( (this.mode == "selector") 
                    ? this.selector.events.indexOf(midiMessage[2])>=0
                    : true
                 )
            );
  }
  
  /**
   * process a midi message already validated with accepts();
   * @midiMessage is a midi compatible array
   * @return the outcome
   */
  process(midiMessage) {
    var score = (this.mode.match(/-/gi)!==null) 
                 ? 127 - midiMessage[2]
                 : midiMessage[2];
    
    switch (this.mode) {
      case "trigger": return this.outcome;
      case "selector": 
        let index = this.selector.events.indexOf(score);
        if (index == -1)
          throw `Filter::process: cannot force score ${score} on selector`;
        return this.selector.triggers[index];
      break;
      case "abs-": case "abs" : break;
      case "int-": case "int":
        score = Math.floor (
              (score/127)*(this.config.max-this.config.min)+this.config.min
            );
      break;
      case "float-": case "float":
      score = Math.round (
              ((score/127)*(this.config.max-this.config.min)+this.config.min)
            *10) / 10;
      break;
      case "bool-" : case "bool":
        score = (score >= this.max) ? "T" : "F";
      break;
      default:
        throw `undefined mode ${this.mode}`;
    }
    
    // faders osc path addition
    var result = { "type" : this.outcome.type};
    
    if (Array.isArray(this.outcome.path)) {
      result.path = [];
      for (let i = 0; i < this.outcome.path.length; i++) {
        result.path[i] = (this.replaceMode)
                  ? this.outcome.path.replace(/ \%/gi, score)
                  : `${this.outcome.path[i]} ${score}`;
      }
    } else {    
      result.path = (this.replaceMode)
                    ? this.outcome.path.replace(/ \%/gi, score)
                    : `${this.outcome.path} ${score}`;
    }
    return result;
  }
   
  /**
   * Cleans a configuration from common errors (upper case) and
   * throws exception if configuration is invalid
   * @return new object, sanitized version of entry
   */
   
  static sanitize(entry) {
    
    //lower case every key
    var result =  Object.fromEntries(Object.entries(entry).map(
                                      ([k, v]) => [k.toLowerCase(), v])
                  );
    
    //osc or shell required
    if (undefined === result.osc && undefined === result.command)
      throw "missing osc or shell parameter";
    if (undefined === result.cc && undefined === result.note)
      throw "missing cc or note event";
    
    if (undefined !== entry.cc)
      result.cc = Number(entry.cc);
    if (undefined !== entry.note)
      result.note = Number(entry.note);
      
    if (undefined === entry.trigger &&
            undefined === entry.fader && 
                undefined === entry.selector)
      throw "missing trigger, fader or selector";
    
    if (result.fader !== undefined) {
      result.fader = result.fader.toLowerCase();
      
      if (result.command !== undefined)
        throw "cannot bind a fader to a command";
      
      if (result.fader.indexOf("abs") == -1) {
        if (undefined === result.max)
          throw "missing max with fader";
        if (undefined === result.min && "bool" != result.fader)
          throw "missing min with fader";
      }
      
      if (result.fader.match(/(int|bool|float|abs)-?/gi) == null)
        throw "unrecognized fader " + result.fader;
    } else if (undefined !== entry.trigger){
      result.trigger = Number(entry.trigger);
    } else {
      //optimization of selector syntax in 2 arrays
      result.selector = {"triggers" : [], "events": []};
      
      result.selectorEvents = [];
      for (trigger in entry.selector) {
        result.selector.triggers.push(Number(trigger));
        result.selector.events.push(entry.selector[trigger]);
      }
    }
    
    return result;
  }
}


/**
 * The FilteMap class turns a configuration file into a bunch of
 * Filter objects.
 * Filter mapping is done via 2 arrays: the first array is defined by
 * the status byte, and contains a bunch of data1 array bytes, that defines
 * the filter. Only 1 filter per data1 is permitted, while you can have up to
 * 16 data filters
 * The last filter is stashed as reference and parsed first; this speeds up
 * faders, in theory.
 */

exports.FilterMap = class {
  /**
   * @param configuration should be an object wrote under the SYNTAX.md json syntax.
   * @param disableShell (default: false) will remove any filter with a shell command.
   */
  constructor(configuration, disableShell) {
    var channels = Object.keys(configuration);
    this.filterMap = [];
    
    if (undefined === disableShell) disableShell = false;
    
    var filterArray;
    var filter;
    var stString, d1String;
    
    channels.forEach ( (channel) => {
      filterArray = configuration[channel];
      filterArray.forEach ( (json_filter) => {
          
          try {
            json_filter = exports.Filter.sanitize(json_filter);
            
            if (undefined !== json_filter.command && disableShell)
              return;
              
            filter = new exports.Filter(channel, json_filter);
          } catch (err) {
            console.log(`Error with filter ${JSON.stringify(json_filter)}: ${err}. Skipping.\n`);
            return;
          }
          
           filter.status.forEach( (status) => {
              if (undefined === this.filterMap[status])
                this.filterMap[status] = [];
              this.filterMap[status][filter.data1] = filter;
            });
    
      }, this);
    }, this);
  }
  
  /**
   * returns the filter map property
   * @return filter map
   */
  getMap(){return this.filterMap};
  
  
  /**
   * process a midi message
   * @return an object with { "type" , "path" } or false if no filter present
   */
   process(midiMessage) {
     if (this.lastFilter !== undefined) {
       if (this.lastFilter.accepts(midiMessage))
        return this.lastFilter.process(midiMessage);
     }
     
     if (undefined === this.filterMap[midiMessage[0]])
      return false;
     if (undefined === this.filterMap[midiMessage[0]][midiMessage[1]])
      return false;
     if (this.filterMap[midiMessage[0]][midiMessage[1]].accepts(midiMessage) ) {
        this.lastFilter = this.filterMap[midiMessage[0]][midiMessage[1]];
        return this.lastFilter.process(midiMessage);
      } else
      return false;
   }   
   
   /**
    * Produces an output of the current map for debugging
    */
   toString() {
     var result = {};
     
     for (let i = 0; i < this.filterMap.length; i++) {
       if (this.filterMap[i] == null)
        continue;
        
       var status = i;
       var filterArray = this.filterMap[i];
       
       for (let j = 0; j < filterArray.length; j++) {
         if (filterArray[j] == null)
           continue;
         result[`S${status}D${j}`] = filterArray[j];
       }
     }
     
     return result;
   }
   /**
    * Merges two filters, according to the rules specified by the method parameter
    * @param source source filtermap
    * @param additional additional filtermap
    * @param preserve if true, preserve source's status byte bindings over additional
    * bindings. preserve is estabilished through status/data1 comparison
    *             "overwrite" to remove source's params
    * @return modified source
    */
    static merge(source, additional, preserve) {
      if (preserve === undefined)
        preserve = false;
      
      for (let i = 0; i < additional.length; i++) {
        if (additional[i] == null)
          continue;
          
        if (source[i] == null || !preserve)
          source[i] = additional[i];
      }
      
      return source;
    }
}
