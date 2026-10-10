(function(){
  var v = vendetta;
  var FluxDispatcher = v.metro.common.FluxDispatcher;
  var MessageStore = v.metro.findByStoreName("MessageStore");
  var unregs = [];

  function toast(t){
    try { v.ui.toasts.showToast(t); } catch(e) { console.log("[LocalMessageEditor] " + t); }
  }

  function opt(args, name){
    for (var i = 0; i < args.length; i++) {
      if (args[i].name === name) return args[i].value;
    }
    return undefined;
  }

  function findMessage(channelId, id){
    if (id) return MessageStore.getMessage(channelId, String(id).trim());
    var list = MessageStore.getMessages(channelId);
    if (!list) return null;
    if (typeof list.last === "function") return list.last();
    var arr = list._array || [];
    return arr[arr.length - 1] || null;
  }

  function reg(cmd){
    unregs.push(v.commands.registerCommand(Object.assign({
      applicationId: "-1",
      inputType: 1,
      type: 1
    }, cmd)));
  }

  return {
    onLoad: function(){
      reg({
        name: "localedit",
        displayName: "localedit",
        description: "Edit a message on this device only",
        displayDescription: "Edit a message on this device only",
        options: [
          { name: "text", displayName: "text", description: "New text", displayDescription: "New text", required: true, type: 3 },
          { name: "id", displayName: "id", description: "Message ID (default: latest message)", displayDescription: "Message ID (default: latest message)", required: false, type: 3 }
        ],
        execute: function(args, ctx){
          var channelId = ctx.channel.id;
          var msg = findMessage(channelId, opt(args, "id"));
          if (!msg) { toast("Message not found"); return; }
          FluxDispatcher.dispatch({
            type: "MESSAGE_UPDATE",
            message: { id: msg.id, channel_id: channelId, content: String(opt(args, "text")) },
            guildId: ctx.guild ? ctx.guild.id : undefined
          });
          toast("Edited locally");
        }
      });

      reg({
        name: "localhide",
        displayName: "localhide",
        description: "Hide a message on this device only",
        displayDescription: "Hide a message on this device only",
        options: [
          { name: "id", displayName: "id", description: "Message ID (default: latest message)", displayDescription: "Message ID (default: latest message)", required: false, type: 3 }
        ],
        execute: function(args, ctx){
          var channelId = ctx.channel.id;
          var msg = findMessage(channelId, opt(args, "id"));
          if (!msg) { toast("Message not found"); return; }
          FluxDispatcher.dispatch({ type: "MESSAGE_DELETE", id: msg.id, channelId: channelId });
          toast("Hidden locally");
        }
      });
    },
    onUnload: function(){
      unregs.forEach(function(u){ try { u(); } catch(e) {} });
      unregs = [];
    }
  };
})()
