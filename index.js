(function(){
  var v = vendetta;
  var React = v.metro.common.React;
  var RN = v.metro.common.ReactNative;
  var FluxDispatcher = v.metro.common.FluxDispatcher;
  var ActionSheet = v.metro.findByProps("openLazy", "hideActionSheet");
  var MessageActions = v.metro.findByProps("startEditMessage", "editMessage");
  var patches = [];
  var pending = null;
  var h = React.createElement;

  function toast(t){
    try { v.ui.toasts.showToast(t); } catch(e) { console.log("[LocalMessageEditor] " + t); }
  }

  function assetId(name){
    try { return v.ui.assets.getAssetIDByName(name); } catch(e) { return undefined; }
  }

  function isRow(el){
    return !!el && !!el.props && typeof el.props.onPress === "function" &&
      (el.props.message !== undefined || el.props.label !== undefined);
  }

  function makeRow(tpl, key, text, iconName, onPress){
    var p = { key: key, onPress: onPress, destructive: false };
    if ("message" in tpl.props) p.message = text;
    if ("label" in tpl.props) p.label = text;
    var id = assetId(iconName);
    if (id !== undefined && "iconSource" in tpl.props) p.iconSource = id;
    return React.cloneElement(tpl, p);
  }

  function closeSheet(){
    try { ActionSheet.hideActionSheet(); } catch(e) {}
  }

  function applyEdit(message, value){
    FluxDispatcher.dispatch({
      type: "MESSAGE_UPDATE",
      message: { id: message.id, channel_id: message.channel_id, content: String(value) }
    });
    toast("この端末だけ編集しました");
  }

  function btn(label, primary, onPress){
    return h(RN.Pressable, {
      onPress: onPress,
      style: {
        flex: 1, marginHorizontal: 4, paddingVertical: 12, borderRadius: 8,
        alignItems: "center", backgroundColor: primary ? "#5865f2" : "#4e5058"
      }
    }, h(RN.Text, { style: { color: "#ffffff", fontWeight: "bold" } }, label));
  }

  function EditSheet(props){
    var st = React.useState(String(props.initial || ""));
    var text = st[0], setText = st[1];
    return h(RN.View, {
      style: {
        backgroundColor: "#2b2d31", padding: 16, paddingBottom: 28,
        borderTopLeftRadius: 16, borderTopRightRadius: 16
      }
    },
      h(RN.Text, { style: { color: "#ffffff", fontSize: 16, fontWeight: "bold", marginBottom: 10 } }, "ローカル編集（この端末だけ）"),
      h(RN.TextInput, {
        value: text,
        onChangeText: setText,
        multiline: true,
        autoFocus: true,
        placeholder: "表示する内容",
        placeholderTextColor: "#80848e",
        style: {
          color: "#ffffff", backgroundColor: "#1e1f22", borderRadius: 8,
          padding: 10, minHeight: 100, textAlignVertical: "top"
        }
      }),
      h(RN.View, { style: { flexDirection: "row", marginTop: 14 } },
        btn("キャンセル", false, function(){ closeSheet(); }),
        btn("適用", true, function(){ closeSheet(); applyEdit(props.message, text); })
      )
    );
  }

  function openFallbackSheet(message){
    ActionSheet.openLazy(
      Promise.resolve({ default: EditSheet }),
      "LocalMessageEditorSheet",
      { message: message, initial: message.content }
    );
  }

  function doEdit(message){
    closeSheet();
    setTimeout(function(){
      if (MessageActions && typeof MessageActions.startEditMessage === "function") {
        try {
          pending = { channelId: message.channel_id, messageId: message.id };
          MessageActions.startEditMessage(message.channel_id, message.id, message.content || "");
          return;
        } catch(e) {
          pending = null;
          console.log("[LocalMessageEditor] startEditMessage failed", e);
        }
      }
      openFallbackSheet(message);
    }, 300);
  }

  function doHide(message){
    closeSheet();
    FluxDispatcher.dispatch({ type: "MESSAGE_DELETE", id: message.id, channelId: message.channel_id });
    toast("この端末だけ非表示にしました");
  }

  return {
    onLoad: function(){
      if (MessageActions && typeof MessageActions.editMessage === "function") {
        patches.push(v.patcher.instead("editMessage", MessageActions, function(args, orig){
          var channelId = args[0], messageId = args[1], body = args[2];
          if (pending && pending.messageId === messageId && pending.channelId === channelId) {
            pending = null;
            var content = body && typeof body.content === "string" ? body.content : "";
            FluxDispatcher.dispatch({
              type: "MESSAGE_UPDATE",
              message: { id: messageId, channel_id: channelId, content: content }
            });
            try { if (typeof MessageActions.endEditMessage === "function") MessageActions.endEditMessage(channelId); } catch(e) {}
            toast("この端末だけ編集しました");
            return Promise.resolve({ ok: true, status: 200, body: {} });
          }
          return orig.apply(this, args);
        }));
      }

      patches.push(v.patcher.before("openLazy", ActionSheet, function(args){
        var component = args[0], key = args[1], data = args[2];
        var message = data && data.message;
        if (key === "MessageLongPressActionSheet") pending = null;
        if (key !== "MessageLongPressActionSheet" || !message) return;

        component.then(function(instance){
          var unpatch = v.patcher.after("default", instance, function(_, res){
            React.useEffect(function(){ return function(){ unpatch(); }; }, []);
            var rows = v.utils.findInReactTree(res, function(x){
              return Array.isArray(x) && x.some(isRow);
            });
            if (!rows) return;
            if (rows.some(function(r){ return r && r.key === "lme-edit"; })) return;
            var tpl = rows.find(isRow);
            var pos = Math.min(rows.length, 2);
            rows.splice(pos, 0,
              makeRow(tpl, "lme-edit", "ローカル編集", "ic_edit_24px", function(){ doEdit(message); }),
              makeRow(tpl, "lme-hide", "ローカルで非表示", "ic_visibility_off_24px", function(){ doHide(message); })
            );
          });
        });
      }));
    },
    onUnload: function(){
      patches.forEach(function(u){ try { u(); } catch(e) {} });
      patches = [];
    }
  };
})()
