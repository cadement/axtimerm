function getParticipants(){$.ajax({url:"/api/event/"+eventId+"/participants",dataType:"json",success:function(e){participants=e},error:function(){alert("There was an error talking to the server.")}})}function genQueueItem(e,t,n){var r=[];r.push('<div id="q-'+t+'" class="q2-item">'),r.push('<div class="q2-rg" style="background-color:'+e.runGroup.color+'">'+(e.runGroup.label||"")+"</div>"),r.push('<div class="q2-btns">'),r.push('<button data-action="up" class="btn btn-primary"><i class="fa fa-arrow-up"></i></button>'),r.push('<button data-action="down" class="btn btn-primary"><i class="fa fa-arrow-down"></i></button>'),r.push('<button data-action="del" class="btn btn-primary"><i class="fa fa-times"></i></button>'),r.push('<div class="runnum">Run: '+e.driverRunNumber+"</div>"),r.push("</div>"),r.push('<div class="q2-info">'),r.push('<div class="q2-num">#'+e.driver.carNumber+" "+e.axClass.name+"</div>"),r.push('<div class="q2-driver">'+e.driver.name+"</div>"),r.push('<div class="q2-car">'+e.driver.car.description+"</div>"),r.push("</div>"),r.push("</div>");var a=$(r.join(""));return a.find('button[data-action="up"]').on("click",function(){moveItemUp(t)}),a.find('button[data-action="down"]').on("click",function(){moveItemDown(t)}),a.find('button[data-action="del"]').on("click",function(){var e=parseInt($(this).parent().parent().attr("id").split("-")[1]);socket.emit("delq",queue[e]._id)}),a}function genInsert(e){return'<div id="ins-'+e+'" class="q2-insert"><i class="fa fa-check-square-o"></i><span> Insert driver here</span></div>'}function insertClick(){$(".q2-insert").toggleClass("selected",!1);$(this).addClass("selected")}function moveItemUp(e){var t=[];if(e>0){var n=e-1,r=queue[n],a=queue.slice(0);a[n]=a[e],a[e]=r;for(var i=0;i<a.length;i++)t.push({pos:i,runId:a[i]._id.toString()});socket.emit("reordq",t)}}function moveItemDown(e){var t=[];if(e<queue.length-1){var n=e+1,r=queue[n],a=queue.slice(0);a[n]=a[e],a[e]=r;for(var i=0;i<a.length;i++)t.push({pos:i,runId:a[i]._id.toString()});socket.emit("reordq",t)}}function addToQueue(){socket.emit("addq",{carNumber:"",participantId:$(this).attr("id").split("-")[2],position:-1})}function getInsertPosition(){var e=$(".q2-insert.selected");if(0==e.length)return-1;var t=e.attr("id").split("-")[1];return"e"==t?-1:parseInt(t)}function sendUnknownToQueue(){var e=getInsertPosition();-1==e||void 0===queue[e]?position="-1":position=queue[e]._id.toString(),socket.emit("addq",{carNumber:"___",participantId:"",position:position}),$("#addcar").toggleClass("hidden",!0),$("#addnum").toggleClass("hidden",!0),dialogVisible=!1,resetSearch()}function sendToQueue(e){var t=getInsertPosition();-1==t||void 0===queue[t]?position="-1":position=queue[t]._id.toString(),socket.emit("addq",{carNumber:"",participantId:e,position:position}),$("#addcar").toggleClass("hidden",!0),$("#addnum").toggleClass("hidden",!0),dialogVisible=!1,resetSearch()}function partClick(){var e=$(this).attr("id").split("-")[1];sendToQueue(e)}function genAllQueueItems(){if($("#queueItems").empty(),0==queue.length)$("#queueItems").append('<div style="padding:10px;">No one queued up yet. <p>For laptop users, this page is keyboard enabled, just start typing a car number and hit enter to submit.<ul><li>Notice the "number box" that appears in the top left corner when you start typing.</li><li>Use number keys to type a number</li><li>Use arrow keys to move the insert position</li><li>Hit Enter or Return to submit</li><li>A <span class="an-match">Green box</span> means a valid car number and only one</li><li>A <span class="an-default">Red box</span> means no match yet</li><li>An <span class="an-multi">Yellow box</span> means there are multiple drivers with that number</li></ul></p></div>');else{$(".q2-insert").toggleClass("selected",!1);for(var e=queue.length,t=0;e>t;t++){var n=genQueueItem(queue[t],t);if($("#queueItems").append(n),t+1!==e&&e>1){var r=$(genInsert(t+1)).on("click",insertClick);$("#queueItems").append(r)}}}$("#ins-e").toggleClass("selected",!0)}function delQueueItem(e){for(var t=[],n=-1,r=0;r<queue.length;r++)queue[r]._id.toString()!=e?t.push(queue[r]):n=r,n>-1&&(queue[r].runNumber=queue[r].runNumber-1);queue=t,genAllQueueItems()}function resetSearch(){searchTerm="",currentSearch="",currentSearchMode="numeric",$("#results").empty(),$("#results").append('<div class="none">No results</div>'),$(".pad2").toggleClass("hidden",!1),$(".alphapad").toggleClass("hidden",!0),$("#unknown").toggleClass("hidden",!0),$("#addcar .title").text("")}function updateAddNum(){$("#addnum").text("#"+currentSearch)}function matchNum(e){var t=participants.filter(function(t,n){return e==t.driver.carNumber?!0:!1}),n=[];if(queue.length>0){for(var r=0;r<t.length;r++){for(var a=t[r],i=!1,s=0;s<queue.length;s++)if(a._id.toString()==queue[s]._id.toString()){i=!0;break}i||n.push(a)}t=n}return t}function moveInsert(e){var t=$(".q2-insert.selected"),n="e";if(0==t.length)return null;var r=t.attr("id").split("-")[1];r="e"==r?queue.length:parseInt(r),n=r+1*e,n>queue.length?n=0:0>n?n="e":n==queue.length&&(n="e"),$("#ins-"+n).trigger("click")}function filter(){var e=currentSearch.length,t=participants.filter(function(t){var n=t.driver.carNumber.replace(" ","").substring(0,e);return n==currentSearch?!0:!1}),n=t.length,r=[];if(queue.length>0){for(var a=0;a<t.length;a++){for(var i=t[a],s=!1,c=0;c<queue.length;c++)if(i._id.toString()==queue[c].participantId.toString()){s=!0;break}s||r.push(i)}t=r}if($("#results").empty(),1==t.length)sendToQueue(t[0]._id);else if(t.length>1)for(var a=0;n>a;a++){var u=t[a],o=u.runGroup.label||"",l='<div id="p-'+u._id+'" class="result2"><div class="outer"><div class="rg" style="background-color:'+u.runGroup.color+'">'+o+'</div><div class="inner"><div class="clsnum">#'+u.driver.carNumber+" "+u.axClass.name+'</div><div class="driver">'+u.driver.name+"<br/>"+u.driver.car.description+"&nbsp;</div></div></div></div>",d=$(l).on("click",partClick);$("#results").append(d)}else $("#results").append('<div class="none">No results for "'+currentSearch+'".  Broaden your search term.</div>')}function showSearch(){var e=$(window).height();$("#addcar").height(e).toggleClass("hidden"),dialogVisible=!0}function sortParticipants(){participants.sort(function(e,t){var n=parseInt(e.driver.carNumber),r=parseInt(t.driver.carNumber);return r>n?-1:n>r?1:0})}function showReconnect(){if(0==$(".msg-reconnect").length){var e='<div class="msg-reconnect"><i class="fa fa-cog fa-spin"></i> You are disconnected from the system, but we are attempting to reconnect.</div>';$("#messages").append(e)}}function showAlert(e,t){var n='<div class="alert">'+e+"<p><a href=\"javascript:$('.alert').remove();\">Dismiss</a></p></div>";$("#messages").append(n)}function searchParticipants(e){var t=[];e=e.toLowerCase();for(var n=0;n<participants.length;n++){var r=participants[n];r.driver.name.toLowerCase().replace(/ /g,"").indexOf(e)>-1?t.push(r):r.axClass.name.toLowerCase().replace(/ /g,"").indexOf(e)>-1?t.push(r):r.driver.firstName.toLowerCase().replace(/ /g,"").indexOf(e)>-1?t.push(r):r.driver.lastName.toLowerCase().replace(/ /g,"").indexOf(e)>-1&&t.push(r)}return t}function matchTerm(e){var t=searchParticipants(e),n=[];if(queue.length>0){for(var r=0;r<t.length;r++){for(var a=t[r],i=!1,s=0;s<queue.length;s++)if(a._id.toString()==queue[s]._id.toString()){i=!0;break}i||n.push(a)}t=n}return t}function filterTerm(){var e=searchTerm.length;if(e>1){var t=matchTerm(searchTerm),n=t.length;if($("#results").empty(),0===t.length)$("#results").html('<div class="none">No results match "'+searchTerm+'"</div>'),$("#unknown").toggleClass("hidden",!1);else for(var r=0;n>r;r++){var a=t[r],i=a.runGroup.label||"",s='<div id="p-'+a._id+'" class="result2"><div class="outer"><div class="rg" style="background-color:'+a.runGroup.color+'">'+i+'</div><div class="inner"><div class="clsnum">#'+a.driver.carNumber+" "+a.axClass.name+'</div><div class="driver">'+a.driver.name+"<br/>"+a.driver.car.description+"&nbsp;</div></div></div></div>",c=$(s).on("click",partClick);$("#results").append(c)}}else $("#results").empty().html('<div class="none">Keep typing letters, '+(2-e)+" more</div>")}function alphaClick(){var e=$(this).data("a");"_"==e?searchTerm+=" ":"-1"==e?searchTerm=searchTerm.substring(0,searchTerm.length-1):"-2"==e?searchTerm="":searchTerm+=e.toString(),$("#addcar .title").text(searchTerm),filterTerm()}var queue=[],dialogVisible=!1,participants=[],socket=io();socket.on("reconnecting",function(){showReconnect(),console.log("reconnecting")}),socket.on("connect",function(){socket.emit("join",{stream:"queue",eventId:eventId}),$("#messages").empty(),console.log("connect")}),socket.on("reconnect",function(){$("#messages").empty(),console.log("reconnect")}),socket.on("disconnect",function(){showAlert("Your connection to the system was disconnected.",!1)}),socket.on("reconnect_failed",function(){showAlert("Reconnect failed.  Please refresh this page.")}),socket.on("message",function(e){showAlert(e.message)});var currentSearch="";socket.on("regchange",function(e){if("add"==e.action)participants.push(e.data);else if("update"==e.action){for(var t=0;t<participants.length;t++)if(participants[t]._id.toString()==e.data._id.toString()){participants[t]=e.data;break}}else if("delete"==e.action){for(var n=[],t=0;t<participants.length;t++)participants[t]._id.toString()!=e.data&&n.push(participants[t]);participants=n}sortParticipants()}),socket.on("initreg",function(e){"full"==e.type&&(participants=e.participants,sortParticipants())}),socket.on("initq",function(e){queue=e,genAllQueueItems()}),socket.on("addq",function(e){var t=queue.length;queue.push(e.run);var n=queue.length-1;if(t>0){var r=$(genInsert(n)).on("click",insertClick);$("#queueItems").append(r)}else $("#queueItems").empty();var a=genQueueItem(e.run,n);$("#queueItems").append(a)}),socket.on("delq",function(e){delQueueItem(e)}),$(".q2-insert").on("click",insertClick),$(document).on("keydown",function(e){function t(){$("#addnum").hasClass("hidden")&&$("#addnum").toggleClass("hidden",!1)}if(e.which>47&&e.which<58&&!dialogVisible){t();var n=e.which-48;currentSearch+=n.toString(),updateAddNum();var r=matchNum(currentSearch).length;$("#addnum").toggleClass("an-match",1==r),$("#addnum").toggleClass("an-multi",r>1)}else if(e.which>95&&e.which<106&&!dialogVisible){t();var n=e.which-96;currentSearch+=n.toString(),updateAddNum();var r=matchNum(currentSearch).length;$("#addnum").toggleClass("an-match",1==r),$("#addnum").toggleClass("an-multi",r>1)}else if(8!==e.which&&46!==e.which||$(e.target).is("input, textarea"))if(27===e.which)currentSearch="",$("#addnum").toggleClass("hidden",!0).toggleClass("an-match",!1).toggleClass("an-multi",!1);else if(13!=e.which||dialogVisible)38!=e.which||dialogVisible?40!=e.which||dialogVisible||moveInsert(1):moveInsert(-1);else if(currentSearch.length>0){var a=matchNum(currentSearch);1==a.length?(sendToQueue(a[0]._id),currentSearch="",$("#addnum").toggleClass("hidden",!0)):(showSearch(),$("#addcar .title").text(""==currentSearch?"":"#"+currentSearch),filter())}else $("#addnum").toggleClass("hidden",!0);else if(t(),e.preventDefault(),""==currentSearch)$("#addnum").toggleClass("hidden",!0);else{currentSearch=currentSearch.substring(0,currentSearch.length-1),updateAddNum();var r=matchNum(currentSearch).length;$("#addnum").toggleClass("an-match",1==r),$("#addnum").toggleClass("an-multi",r>1)}}),$(".pad2-num").on("click",function(){var e=$(this).data("num");"X"==e?resetSearch():(currentSearch=currentSearch.toString()+e.toString(),$("#addcar .title").text(""==currentSearch?"":"#"+currentSearch),filter())}),$("#btn-close").on("click",function(){dialogVisible=!1,$("#addcar").toggleClass("hidden",!0),$("#addnum").toggleClass("hidden",!0),resetSearch()}),$("#btn-show").on("click",function(){showSearch()}),$(window).on("resize",function(){$("#addcar").height($(window).height())});var searchTerm="",currentSearchMode="numeric",alphaEl=$(".alphapad .item").on("click",alphaClick);$("#btn-search").on("click",function(){currentSearchMode="numeric"==currentSearchMode?"alpha":"numeric",$(".pad2").toggleClass("hidden","numeric"!=currentSearchMode),$(".alphapad").toggleClass("hidden","alpha"!=currentSearchMode),searchTerm="",currentSearch="",$("#unknown").toggleClass("hidden",!0),$("#addcar .title").text(""),$("#results").empty().html('<div class="none">No Results yet.  Start tapping the '+("numeric"==currentSearchMode?"numbers":"letters")+".</div>"),$(this).text("numeric"==currentSearchMode?"abc":"123")}),$("#btn-unknown").on("click",function(){sendUnknownToQueue(),resetSearch()});