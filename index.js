(function(){
  var v = vendetta;
  var React = v.metro.common.React;
  var FluxDispatcher = v.metro.common.FluxDispatcher;
  var ActionSheet = v.metro.findByProps("openLazy", "hideActionSheet");
  var patches = [];

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

  function doEdit(message){
    closeSheet();
    setTimeout(function(){
      v.ui.alerts.showInputAlert({
        title: "ローカル編集",
        initialValue: String(message.content || ""),
        placeholder: "表示する内容",
        confirmText: "適用",
        cancelText: "キャンセル",
        onConfirm: function(value){
          FluxDispatcher.dispatch({
            type: "MESSAGE_UPDATE",
            message: { id: message.id, channel_id: message.channel_id, content: String(value) }
          });
          toast("この端末だけ編集しました");
        }
      });
    }, 300);
  }

  function doHide(message){
    closeSheet();
    FluxDispatcher.dispatch({ type: "MESSAGE_DELETE", id: message.id, channelId: message.channel_id });
    toast("この端末だけ非表示にしました");
  }

  return {
    onLoad: function(){
      patches.push(v.patcher.before("openLazy", ActionSheet, function(args){
        var component = args[0], key = args[1], data = args[2];
        var message = data && data.message;
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
