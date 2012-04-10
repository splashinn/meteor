var player = function () {
  return Players.findOne(Session.get('player_id'));
};

var game = function () {
  var me = player();
  return me && me.game_id && Games.findOne(me.game_id);
};

var create_my_player = function (name) {
  // kill my bad words after 5 seconds.
  Words.find({player_id: Session.get('player_id'), state: 'bad'})
    .observe({
      added: function (word) {
        setTimeout(function () {
          $('#word_' + word._id).fadeOut(1000, function () {
            Words.remove(word._id);
          });
        }, 5000);
      }});
};

var set_selected_positions = function (word) {
  var paths = paths_for_word(game().board, word.toUpperCase());
  var in_a_path = [];
  var last_in_a_path = [];

  for (var i = 0; i < paths.length; i++) {
    in_a_path = in_a_path.concat(paths[i]);
    last_in_a_path.push(paths[i].slice(-1)[0]);
  }

  for (var pos = 0; pos < 16; pos++) {
    if (last_in_a_path.indexOf(pos) !== -1)
      Session.set('selected_' + pos, 'last_in_path');
    else if (in_a_path.indexOf(pos) !== -1)
      Session.set('selected_' + pos, 'in_path');
    else
      Session.set('selected_' + pos, false);
  }
};

var clear_selected_positions = function () {
  for (var pos = 0; pos < 16; pos++)
    Session.set('selected_' + pos, false);
};

//////
////// lobby template: shows everyone not currently playing, and
////// offers a button to start a fresh game.
//////

Template.lobby.show = function () {
  return !game();
};

Template.lobby.waiting = function () {
  var players = Players.find({_id: {$ne: Session.get('player_id')},
                              name: {$ne: ''},
                              game_id: {$exists: false}});

  return players;
};

Template.lobby.count = function () {
  var players = Players.find({_id: {$ne: Session.get('player_id')},
                              name: {$ne: ''},
                              game_id: {$exists: false}});

  return players.count();
};

Template.lobby.events = {
  'keyup input#myname': function (evt) {
    var name = $('#lobby input#myname').val().trim();
    Players.update(Session.get('player_id'), {$set: {name: name}});
  },
  'click button.startgame': function () {
    Meteor.call('start_new_game');
  }
};

//////
////// board template: renders the board and the clock given the
////// current game.  if there is no game, show a splash screen.
//////
var SPLASH = ['','','','',
              'W', 'O', 'R', 'D',
              'P', 'L', 'A', 'Y',
              '','','',''];

Template.board.square = function (i) {
  var g = game();
  return g && g.board && g.board[i] || SPLASH[i];
};

Template.board.selected = function (i) {
  return Session.get('selected_' + i);
};

Template.board.clock = function () {
  var clock = game() && game().clock;

  if (!clock || clock === 0)
    return;

  // format into M:SS
  var min = Math.floor(clock / 60);
  var sec = clock % 60;
  return min + ':' + (sec < 10 ? ('0' + sec) : sec);
};

Template.board.events = {
  'click .square': function (evt) {
    var textbox = $('#scratchpad input');
    textbox.val(textbox.val() + evt.target.innerHTML);
    textbox.focus();
  }
};

//////
////// scratchpad is where we enter new words.
//////

Template.scratchpad.show = function () {
  return game() && game().clock > 0;
};

// wish we had a better pattern here.  this comes up all the time.
Template.scratchpad.events = {
  'click button': function (evt) {
    var textbox = $('#scratchpad input');
    var word_id = Words.insert({player_id: Session.get('player_id'),
                                game_id: game() && game()._id,
                                word: textbox.val().toUpperCase(),
                                state: 'pending'});
    Meteor.call('score_word', word_id);
    textbox.val('');
    textbox.focus();
    clear_selected_positions();
  },
  'keyup input': function (evt) {
    var textbox = $('#scratchpad input');
    if (13 === evt.which) {
      var word_id = Words.insert({player_id: Session.get('player_id'),
                                  game_id: game() && game()._id,
                                  word: textbox.val().toUpperCase(),
                                  state: 'pending'});
      Meteor.call('score_word', word_id);
      textbox.val('');
      textbox.focus();
      clear_selected_positions();
    } else {
      set_selected_positions(textbox.val());
    }
  }
};

Template.postgame.show = function () {
  return game() && game().clock === 0;
};

Template.postgame.events = {
  'click button': function (evt) {
    Players.update(Session.get('player_id'), {$set: {game_id: null}});
  }
}

//////
////// scores shows everyone's score and word list.
//////

Template.scores.show = function () {
  return !!game();
};

Template.scores.players = function () {
  return game() && game().players;
};

Template.player.total_score = function () {
  var words = Words.find({game_id: game() && game()._id,
                          player_id: this._id});

  var score = 0;
  words.forEach(function (word) {
    if (word.score)
      score += word.score;
  });
  return score;
};

Template.words.words = function () {
  return Words.find({game_id: game() && game()._id,
                    player_id: this._id});
};



Meteor.startup(function () {
  // Allocate a new player id.
  //
  // XXX this does not handle hot reload. In the reload case,
  // Session.get('player_id') will return a real id.
  var player_id = Players.insert({name: '', idle: false});
  Session.set('player_id', player_id);

  // subscribe to all the players, the game i'm in, and all
  // the words in that game.
  Meteor.autosubscribe(function () {
    Meteor.subscribe('players');

    if (Session.get('player_id')) {
      var me = player();
      if (me && me.game_id) {
        Meteor.subscribe('games', me.game_id);
        Meteor.subscribe('words', me.game_id, Session.get('player_id'));
      }
    }
  });

  // send keepalives so the server can tell when we go away.
  Meteor.setInterval(function() {
    if (Meteor.status().connected)
      Meteor.call('keepalive', Session.get('player_id'));
  }, 20*1000);
});
