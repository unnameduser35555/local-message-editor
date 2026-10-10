(function(){
  var v = vendetta;
  var VERSION = "v2.0";
  var React = v.metro.common.React;
  var RN = v.metro.common.ReactNative;
  var FluxDispatcher = v.metro.common.FluxDispatcher;
  var clipboard = v.metro.common.clipboard;
  var ActionSheet = v.metro.findByProps("openLazy", "hideActionSheet");
  var EditActions = v.metro.findByProps("startEditMessage") || v.metro.findByProps("deleteMessage");
  var SendActions = v.metro.findByProps("editMessage", "sendMessage");
  var MessageStore = v.metro.findByStoreName("MessageStore");
  var patches = [];
  var pending = null;

  function toast(t){
    try { v.ui.toasts.showToast(t); } catch(e) { console.log("[Lex] " + t); }
  }

  function assetId(names){
    var list = Array.isArray(names) ? names : [names];
    for (var i = 0; i < list.length; i++) {
      try {
        var id = v.ui.assets.getAssetIDByName(list[i]);
        if (id !== undefined && id !== null) return id;
      } catch(e) {}
    }
    return undefined;
  }

  function isRow(el){
    return !!el && !!el.props && typeof el.props.onPress === "function" &&
      (el.props.message !== undefined || el.props.label !== undefined);
  }

  function makeRow(tpl, key, text, icons, onPress){
    var p = { key: key, onPress: onPress, destructive: false };
    if ("message" in tpl.props) p.message = text;
    if ("label" in tpl.props) p.label = text;
    var id = assetId(icons);
    if (id !== undefined && "iconSource" in tpl.props) p.iconSource = id;
    return React.cloneElement(tpl, p);
  }

  function closeSheet(){
    try { ActionSheet.hideActionSheet(); } catch(e) {}
  }

  function update(message, patch){
    var body = { id: message.id, channel_id: message.channel_id };
    for (var k in patch) body[k] = patch[k];
    FluxDispatcher.dispatch({ type: "MESSAGE_UPDATE", message: body });
  }

  // ---- 本文: Discord標準の編集UIを使う ----
  function doEdit(message){
    closeSheet();
    setTimeout(function(){
      if (EditActions && typeof EditActions.startEditMessage === "function") {
        try {
          pending = { channelId: message.channel_id, messageId: message.id };
          EditActions.startEditMessage(message.channel_id, message.id, message.content || "");
          return;
        } catch(e) {
          pending = null;
          console.log("[Lex] startEditMessage failed", e);
        }
      }
      toast("Lex " + VERSION + ": 標準の編集UIが見つかりません");
    }, 300);
  }

  // ---- 画像: クリップボードのURLに差し替え ----
  function imgSize(url){
    return new Promise(function(resolve){
      try { RN.Image.getSize(url, function(w, h){ resolve({ w: w, h: h }); }, function(){ resolve(null); }); }
      catch(e) { resolve(null); }
    });
  }

  function withUrl(obj, url, w, h){
    return Object.assign({}, obj, { url: url, proxy_url: url, proxyURL: url, width: w, height: h });
  }

  function doReplaceImage(message){
    closeSheet();
    Promise.resolve(clipboard.getString()).then(function(raw){
      var url = String(raw || "").trim();
      if (!/^https?:\/\/\S+$/i.test(url)) {
        toast("画像のURLをコピーしてから、もう一度押してください");
        return;
      }
      return imgSize(url).then(function(sz){
        var w = sz ? sz.w : 512, h = sz ? sz.h : 512;
        var hasEmbedImage = false;
        var embeds = (message.embeds || []).map(function(e){
          var c = Object.assign({}, e);
          if (c.image) { c.image = withUrl(c.image, url, w, h); hasEmbedImage = true; }
          if (c.thumbnail) { c.thumbnail = withUrl(c.thumbnail, url, w, h); hasEmbedImage = true; }
          return c;
        });
        var atts = (message.attachments || []).map(function(a){
          var c = withUrl(a, url, w, h);
          c.content_type = "image/png";
          c.filename = "image.png";
          return c;
        });
        if (!atts.length && !hasEmbedImage) {
          atts.push({
            id: "lex-" + Date.now(), filename: "image.png", size: 0, content_type: "image/png",
            url: url, proxy_url: url, proxyURL: url, width: w, height: h
          });
        }
        update(message, { attachments: atts, embeds: embeds });
        toast("画像をこの端末だけ差し替えました");
      });
    }).catch(function(e){ console.log("[Lex] replace image failed", e); toast("画像の差し替えに失敗しました"); });
  }

  // ---- 画像・埋め込みを消す ----
  function isMediaEmbed(e){
    return !!e && (!!e.image || !!e.thumbnail || !!e.video || e.type === "image" || e.type === "gifv" || e.type === "video");
  }

  function doRemoveMedia(message){
    closeSheet();
    update(message, {
      attachments: [],
      embeds: (message.embeds || []).filter(function(e){ return !isMediaEmbed(e); })
    });
    toast("画像・埋め込みをこの端末だけ消しました");
  }

  // ---- 非表示 ----
  function stillThere(message){
    try { return !!(MessageStore && MessageStore.getMessage(message.channel_id, message.id)); }
    catch(e) { return false; }
  }

  function doHide(message){
    closeSheet();
    var cid = message.channel_id, id = message.id;
    FluxDispatcher.dispatch({ type: "MESSAGE_DELETE", id: id, channelId: cid });
    var how = "DELETE";
    if (stillThere(message)) {
      FluxDispatcher.dispatch({ type: "MESSAGE_DELETE_BULK", ids: [id], channelId: cid });
      how = "BULK";
    }
    if (stillThere(message)) {
      update(message, { content: "", attachments: [], embeds: [] });
      how = "BLANK";
    }
    toast("非表示 (" + how + ")");
  }

  return {
    onLoad: function(){
      console.log("[Lex] Lex Message Editor " + VERSION + " loaded");

      if (SendActions && typeof SendActions.editMessage === "function") {
        patches.push(v.patcher.instead("editMessage", SendActions, function(args, orig){
          var channelId = args[0], messageId = args[1], body = args[2];
          if (pending && pending.messageId === messageId && pending.channelId === channelId) {
            pending = null;
            var content = body && typeof body.content === "string" ? body.content : "";
            FluxDispatcher.dispatch({
              type: "MESSAGE_UPDATE",
              message: { id: messageId, channel_id: channelId, content: content }
            });
            try {
              var ender = (EditActions && EditActions.endEditMessage) ? EditActions : SendActions;
              if (ender && typeof ender.endEditMessage === "function") ender.endEditMessage(channelId);
            } catch(e) {}
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
            if (rows.some(function(r){ return r && r.key === "lex-edit"; })) return;
            var tpl = rows.find(isRow);
            var pos = Math.min(rows.length, 2);
            rows.splice(pos, 0,
              makeRow(tpl, "lex-edit", "Lex: 本文を編集", "ic_edit_24px", function(){ doEdit(message); }),
              makeRow(tpl, "lex-img", "Lex: 画像を差し替え（コピーしたURL）", ["ic_image_24px", "ic_image"], function(){ doReplaceImage(message); }),
              makeRow(tpl, "lex-rmimg", "Lex: 画像・埋め込みを消す", ["ic_close_16px", "ic_close"], function(){ doRemoveMedia(message); }),
              makeRow(tpl, "lex-hide", "Lex: 非表示", "ic_visibility_off_24px", function(){ doHide(message); })
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
