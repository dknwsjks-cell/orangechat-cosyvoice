// 音乐播放器插件 - AI工具函数
// 通过 dataStore 与 WebView UI 协调，WebView 发送控制命令给后台 MusicPlayerService

function list_songs(params) {
  var keys = dataStore.list("song_");
  var songs = [];
  for (var i = 0; i < keys.length; i++) {
    var raw = dataStore.get(keys[i]);
    if (raw) {
      try {
        songs.push(JSON.parse(raw));
      } catch(e) {}
    }
  }
  return { success: true, songs: songs, count: songs.length };
}

function play_song(params) {
  var name = params.name || "";
  if (!name) return { success: false, error: "请提供音乐文件名" };
  
  var songData = dataStore.get("song_" + name);
  if (!songData) {
    var all = dataStore.list("song_");
    var matches = [];
    for (var i = 0; i < all.length; i++) {
      if (all[i].toLowerCase().indexOf(name.toLowerCase()) >= 0) {
        matches.push(all[i]);
      }
    }
    if (matches.length === 1) {
      songData = dataStore.get(matches[0]);
    } else if (matches.length > 1) {
      return { success: false, error: "找到多个匹配的音乐：" + matches.join(", "), matches: matches };
    }
  }
  
  if (!songData) return { success: false, error: "未找到音乐：" + name };
  
  var song;
  try {
    song = JSON.parse(songData);
  } catch(e) {
    return { success: false, error: "音乐数据损坏" };
  }
  
  dataStore.set("__music_cmd", JSON.stringify({ action: "play", filePath: song.filePath, title: song.title, artist: song.artist || "" }));
  return { success: true, message: "正在播放：" + song.title };
}

function pause_music(params) {
  dataStore.set("__music_cmd", JSON.stringify({ action: "pause" }));
  return { success: true, message: "已暂停" };
}

function resume_music(params) {
  dataStore.set("__music_cmd", JSON.stringify({ action: "resume" }));
  return { success: true, message: "继续播放" };
}

function stop_music(params) {
  dataStore.set("__music_cmd", JSON.stringify({ action: "stop" }));
  return { success: true, message: "已停止播放" };
}

function music_status(params) {
  var cmd = dataStore.get("__music_status");
  if (cmd) {
    try {
      return { success: true, status: JSON.parse(cmd) };
    } catch(e) {}
  }
  return { success: true, status: { state: "stopped", title: "", artist: "" } };
}

exports.list_songs = list_songs;
exports.play_song = play_song;
exports.pause_music = pause_music;
exports.resume_music = resume_music;
exports.stop_music = stop_music;
exports.music_status = music_status;