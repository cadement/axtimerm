$("#btn-recalcEvent").on("click",function(){$.ajax({url:"/api/event/"+eventId+"/recalcEvent",type:"GET",dataType:"json",success:function(e){e.success?alert("The event has been recalculated."):alert("There was an error recalculating the event.\n\n"+e.message)}})}),$("#btn-rmlivesync").on("click",function(){$.ajax({url:"/api/event/"+eventId+"/rmlive/sync",type:"POST",dataType:"json",success:function(e){e.success?alert("Successfully submitted event to be sent to  RM Live"):alert("There was an error submitting this event to RM Live.\n\n"+(e.message||"unknown error"))},error:function(e,n,t){alert("Oops, are you connected to AXti.me RM? or is RM running?")}})});