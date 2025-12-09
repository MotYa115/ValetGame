const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Статические файлы
app.use(express.static(path.join(__dirname, 'public')));

// Логика игры с сохранением данных
class Game {
  constructor() {
    this.rooms = new Map(); // Хранение комнат
    this.players = new Map(); // Хранение игроков
    this.dataFile = 'game_data.json';
    this.loadFromDisk(); // Загрузка данных при старте

    // Сохранение данных перед завершением работы
    process.on('SIGINT', () => {
      console.log('Сохранение данных перед завершением...');
      this.saveToDisk();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log('Сохранение данных перед завершением...');
      this.saveToDisk();
      process.exit(0);
    });
  }

  // Методы для сохранения и загрузки данных
  saveToDisk() {
    try {
      const dataToSave = {
        rooms: {},
        players: {} // В реальности игроки хранятся в комнатах
      };

      // Сохраняем комнаты
      for (const [roomId, room] of this.rooms) {
        // Сохраняем только необходимые данные, исключая веб-сокеты
        dataToSave.rooms[roomId] = {
          players: room.players.map(p => ({
            id: p.id,
            name: p.name,
            suit: p.suit,
            rank: p.rank,
            isJackOfHearts: p.isJackOfHearts,
            isAlive: p.isAlive,
            hasSubmittedGuess: p.hasSubmittedGuess,
            isDisconnected: p.isDisconnected
          })),
          gameStarted: room.gameStarted,
          currentRound: room.currentRound,
          roundPhase: room.roundPhase,
          discussionTimeLeft: room.discussionTimeLeft,
          guessingTimeLeft: room.guessingTimeLeft,
          discussionTime: room.discussionTime,
          guessingTime: room.guessingTime,
          minPlayers: room.minPlayers,
          password: room.password, // ЗАШИФРОВАННЫЙ ПАРОЛЬ
          eliminatedPlayers: room.eliminatedPlayers,
          suits: room.suits,
          ranks: room.ranks,
          // Добавим информацию о Червовом Валете
          jackOfHearts: room.jackOfHearts ? room.jackOfHearts.id : null
        };
      }

      fs.writeFileSync(this.dataFile, JSON.stringify(dataToSave, null, 2));
      console.log('Данные успешно сохранены на диск');
    } catch (error) {
      console.error('Ошибка при сохранении данных:', error);
    }
  }

  loadFromDisk() {
    try {
      if (fs.existsSync(this.dataFile)) {
        const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));

        // Восстановим комнаты
        for (const [roomId, roomData] of Object.entries(data.rooms)) {
          // Создаем комнату с сохраненными параметрами
          this.rooms.set(roomId, {
            players: [], // Инициализируем пустым массивом, заполним ниже
            gameStarted: roomData.gameStarted,
            currentRound: roomData.currentRound,
            jackOfHearts: roomData.jackOfHearts,
            roundPhase: roomData.roundPhase,
            discussionTimeLeft: roomData.discussionTimeLeft,
            guessingTime: roomData.guessingTime,
            guessingTime: roomData.guessingTime,
            discussionTime: roomData.discussionTime,
            minPlayers: roomData.minPlayers,
            password: roomData.password,
            eliminatedPlayers: roomData.eliminatedPlayers,
            suits: roomData.suits,
            ranks: roomData.ranks,
            discussionTimer: null, // Будет восстановлен при необходимости
            guessingTimer: null   // Будет восстановлен при необходимости
          });

          // Восстановим игроков
          const restoredRoom = this.rooms.get(roomId);
          for (const playerData of roomData.players) {
            const restoredPlayer = {
              id: playerData.id,
              ws: null, // WebSocket будет восстановлен при повторном подключении
              name: playerData.name,
              suit: playerData.suit,
              rank: playerData.rank,
              isJackOfHearts: playerData.isJackOfHearts,
              isAlive: playerData.isAlive,
              hasSubmittedGuess: playerData.hasSubmittedGuess,
              isDisconnected: playerData.isDisconnected
            };

            restoredRoom.players.push(restoredPlayer);
            this.players.set(restoredPlayer.id, restoredPlayer);
          }
        }

        console.log('Данные успешно загружены с диска');
      } else {
        console.log('Файл данных не найден, начинаем новую игру');
      }
    } catch (error) {
      console.error('Ошибка при загрузке данных:', error);
      console.log('Начинаем новую игру');
    }
  }

  createRoom(roomId, minPlayers = 6, discussionTime = 120, guessingTime = 60, password) {
    if (!this.rooms.has(roomId)) {
      // Проверяем, что пароль обязательно задан
      if (!password) {
        throw new Error('Пароль комнаты обязателен');
      }

      this.rooms.set(roomId, {
        players: [],
        gameStarted: false,
        currentRound: 1,
        jackOfHearts: null,
        roundPhase: 'waiting', // waiting, discussion, guessing
        discussionTimeLeft: 0,
        guessingTimeLeft: 0,
        discussionTime: discussionTime, // Время обсуждения (по умолчанию 120 секунд)
        guessingTime: guessingTime,    // Время угадывания (по умолчанию 60 секунд)
        minPlayers: minPlayers,        // Минимальное количество игроков (по умолчанию 6)
        password: password,            // Пароль комнаты (обязательный)
        eliminatedPlayers: [],
        suits: ['♠', '♥', '♦', '♣'],
        ranks: ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
      });
      console.log(`Создана комната: ${roomId} с параметрами: мин. игроков ${minPlayers}, обсуждение ${discussionTime}с, угадывание ${guessingTime}с, пароль: установлен`);

      // Автосохранение
      this.saveToDisk();
    }
    return this.rooms.get(roomId);
  }

  addPlayer(ws, roomId, playerName, password = null) {
    try {
      const room = this.rooms.get(roomId);

      // Если комнаты не существует, возвращаем ошибку
      if (!room) {
        return { success: false, message: 'Комната с таким ID не найдена.' };
      }

      // Пароль обязателен для подключения к комнате
      if (!password || room.password !== password) {
        return { success: false, message: password ? 'Неверный пароль для доступа к комнате.' : 'Пароль обязателен для доступа к комнате.' };
      }

      // Проверяем, есть ли уже игрок с таким именем в этой комнате
      if (room.players.some(p => p.name === playerName)) {
        return { success: false, message: 'Имя игрока уже занято в этой комнате. Выберите другое имя.' };
      }

      // Проверяем, не подключен ли уже другой ws с тем же именем к этой комнате
      const existingWs = room.players.find(p => p.ws === ws);
      if (existingWs) {
        return { success: false, message: 'Вы уже подключены к этой комнате.' };
      }

      const player = {
        id: ws.id || Date.now() + Math.random(),
        ws: ws,
        name: playerName,
        suit: null,
        rank: null,
        isJackOfHearts: false,
        isAlive: true,
        hasSubmittedGuess: false,
        isDisconnected: false
      };

      room.players.push(player);
      this.players.set(player.id, player);

      console.log(`Игрок ${playerName} присоединился к комнате ${roomId}. Всего игроков: ${room.players.length}`);

      // Если набрано минимальное количество игроков для этой комнаты, начинаем игру
      if (room.players.length >= room.minPlayers && !room.gameStarted) {
        this.startGame(roomId);
      }

      // Возвращаем успешный результат с информацией об игроке
      return { success: true, player };
    } catch (e) {
      console.error('Ошибка при добавлении игрока:', e);
      return { success: false, message: 'Произошла ошибка при присоединении к комнате.' };
    }
  }

  startGame(roomId) {
    const room = this.rooms.get(roomId);
    if (room.players.length < room.minPlayers) return;

    console.log(`Начинаем игру в комнате ${roomId} с ${room.players.length} игроками`);

    // Создаем и перемешиваем колоду
    const deck = this.createDeck(room.suits, room.ranks);
    this.shuffleDeck(deck);

    // Раздаем карты игрокам
    for (let i = 0; i < room.players.length; i++) {
      const card = deck[i];
      room.players[i].suit = card.suit;
      room.players[i].rank = card.rank;
    }

    // Назначаем Червового Валета
    const jackIndex = Math.floor(Math.random() * room.players.length);
    room.players[jackIndex].isJackOfHearts = true;
    room.jackOfHearts = room.players[jackIndex];

    room.gameStarted = true;
    room.roundPhase = 'discussion';
    room.discussionTimeLeft = room.discussionTime; // Используем настраиваемое время обсуждения

    // Рассылаем информацию каждому игроку индивидуально
    for (const player of room.players) {
      if (player.ws && player.ws.readyState === WebSocket.OPEN) {
        // Формируем информацию о других игроках (без масти текущего игрока)
        const otherPlayersInfo = room.players.map(p => ({
          id: p.id,
          name: p.name,
          card: p.id === player.id ? `${p.rank}?` : `${p.rank}${p.suit}`,
          suitSymbol: p.id === player.id ? '?' : p.suit, // Символ масти для отображения
          isAlive: p.isAlive,
          isJackOfHearts: false // Не показываем, что игрок - Червовый Валет другим игрокам
        }));

        // Отправляем игроку информацию о себе и других
        player.ws.send(JSON.stringify({
          type: 'gameStarted',
          playerData: {
            id: player.id,
            rank: player.rank,
            isJackOfHearts: player.isJackOfHearts
          },
          otherPlayers: otherPlayersInfo
        }));
      }
    }

    // Начинаем таймер обсуждения
    this.startDiscussionTimer(roomId);

    // Сохраняем данные при значительном изменении
    this.saveToDisk();
  }

  createDeck(suits, ranks) {
    const deck = [];
    for (const suit of suits) {
      for (const rank of ranks) {
        deck.push({ suit, rank });
      }
    }
    
    // Убедимся, что в колоде есть Червовый Валет
    const jackOfHeartsExists = deck.some(card => card.rank === 'J' && card.suit === '♥');
    if (!jackOfHeartsExists) {
      deck.push({ suit: '♥', rank: 'J' });
    }
    
    return deck;
  }

  shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }

  startDiscussionTimer(roomId) {
    const room = this.rooms.get(roomId);
    if (room.discussionTimer) {
      clearInterval(room.discussionTimer);
    }

    room.discussionTimer = setInterval(() => {
      room.discussionTimeLeft--;

      if (room.discussionTimeLeft <= 0) {
        clearInterval(room.discussionTimer);
        this.startGuessingPhase(roomId);
      } else {
        // Отправляем обновление таймера
        this.broadcastToRoom(roomId, {
          type: 'timerUpdate',
          phase: 'discussion',
          timeLeft: room.discussionTimeLeft,
          discussionTime: room.discussionTime // Отправляем общее время обсуждения
        });
      }
    }, 1000);
  }

  startGuessingPhase(roomId) {
    const room = this.rooms.get(roomId);
    room.roundPhase = 'guessing';
    room.guessingTimeLeft = room.guessingTime; // Используем настраиваемое время угадывания

    this.broadcastToRoom(roomId, {
      type: 'guessingPhaseStarted'
    });

    // Запускаем таймер фазы угадывания
    if (room.guessingTimer) {
      clearInterval(room.guessingTimer);
    }

    room.guessingTimer = setInterval(() => {
      room.guessingTimeLeft--;

      if (room.guessingTimeLeft <= 0) {
        clearInterval(room.guessingTimer);
        this.processGuesses(roomId);
      } else {
        this.broadcastToRoom(roomId, {
          type: 'timerUpdate',
          phase: 'guessing',
          timeLeft: room.guessingTimeLeft,
          guessingTime: room.guessingTime // Отправляем общее время угадывания
        });
      }
    }, 1000);
  }

  submitGuess(roomId, playerId, guess) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    
    const player = room.players.find(p => p.id === playerId);

    if (player && player.isAlive && room.roundPhase === 'guessing') {
      player.guess = guess;
      player.hasSubmittedGuess = true;

      // Отправляем подтверждение игроку
      if (player.ws && player.ws.readyState === WebSocket.OPEN) {
        player.ws.send(JSON.stringify({
          type: 'guessSubmitted',
          suit: guess
        }));
      }

      // Проверяем, все ли игроки сделали свои догадки
      const allSubmitted = room.players.filter(p => p.isAlive).every(p => p.hasSubmittedGuess);

      if (allSubmitted) {
        clearInterval(room.guessingTimer);
        this.processGuesses(roomId);
      }
    }
  }

  processGuesses(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const incorrectGuesses = [];

    // Проверяем догадки игроков
    for (const player of room.players) {
      if (player.isAlive && player.hasSubmittedGuess) {
        if (player.guess !== player.suit) {
          player.isAlive = false;
          incorrectGuesses.push(player);
          room.eliminatedPlayers.push({
            id: player.id,
            name: player.name,
            correctSuit: player.suit,
            guess: player.guess
          });
        }
        player.hasSubmittedGuess = false; // Сброс для следующего раунда
      } else if (player.isAlive && !player.hasSubmittedGuess) {
        // Игрок не успел угадать
        player.isAlive = false;
        incorrectGuesses.push(player);
        room.eliminatedPlayers.push({
          id: player.id,
          name: player.name,
          correctSuit: player.suit,
          guess: 'не угадал'
        });
      }
    }

    // Отправляем результаты угадывания
    this.broadcastToRoom(roomId, {
      type: 'guessResults',
      incorrectGuesses: incorrectGuesses.map(p => ({
        id: p.id,
        name: p.name,
        correctSuit: p.suit,
        guess: p.guess
      }))
    });

    // Обновляем информацию о других игроках (для следующего раунда)
    this.updatePlayersInfoForNextRound(roomId);

    // Проверяем условия окончания игры
    this.checkGameOver(roomId);

    // Сохраняем данные при значительном изменении
    this.saveToDisk();
  }

  updatePlayersInfoForNextRound(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    // Создаем новую перемешанную колоду для следующего раунда
    const deck = this.createDeck(room.suits, room.ranks);
    this.shuffleDeck(deck);

    // Переназначаем карты живым игрокам
    const alivePlayers = room.players.filter(p => p.isAlive);
    for (let i = 0; i < alivePlayers.length; i++) {
      const card = deck[i];
      alivePlayers[i].suit = card.suit;
      alivePlayers[i].rank = card.rank;
    }

    // Переназначаем Червового Валета среди живых игроков
    if (alivePlayers.length > 0) {
      // Проверяем, был ли Червовый Валет среди выбывших
      const currentJack = room.players.find(p => p.isJackOfHearts);
      if (!currentJack || !currentJack.isAlive) {
        // Если текущий Червовый Валет выбыл, выбираем нового среди живых
        const newJackIndex = Math.floor(Math.random() * alivePlayers.length);
        // Сбрасываем статус у всех игроков
        room.players.forEach(p => p.isJackOfHearts = false);
        alivePlayers[newJackIndex].isJackOfHearts = true;
        room.jackOfHearts = alivePlayers[newJackIndex];
      }
    }

    // Рассылаем обновленную информацию о других игроках
    for (const player of room.players) {
      if (!player.isDisconnected && player.ws && player.ws.readyState === WebSocket.OPEN) {
        // Формируем информацию о других игроках
        const otherPlayersInfo = room.players.map(p => ({
          id: p.id,
          name: p.name,
          card: p.id === player.id ? `${p.rank}?` : `${p.rank}${p.suit}`,
          suitSymbol: p.id === player.id ? '?' : p.suit,
          isAlive: p.isAlive,
          isJackOfHearts: false // Не показываем, что игрок - Червовый Валет другим игрокам
        }));

        player.ws.send(JSON.stringify({
          type: 'playersInfo',
          players: otherPlayersInfo
        }));
      }
    }
  }

  checkGameOver(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    const alivePlayers = room.players.filter(p => p.isAlive);

    // Проверяем условия окончания игры:
    // 1. Червовый Валет убит (для всех остальных игроков игра окончена)
    const jackAlive = alivePlayers.some(p => p.isJackOfHearts);

    if (!jackAlive) {
      this.broadcastToRoom(roomId, {
        type: 'gameOver',
        winner: 'otherPlayers',
        message: 'Червовый Валет мертв! Остальные игроки побеждают!'
      });
      this.saveToDisk(); // Сохраняем результаты игры
      return true;
    }

    // 2. Остался один живой игрок и это Червовый Валет (Валет побеждает)
    if (alivePlayers.length === 1 && alivePlayers[0].isJackOfHearts) {
      this.broadcastToRoom(roomId, {
        type: 'gameOver',
        winner: 'jackOfHearts',
        message: 'Червовый Валет побеждает - он остался один!'
      });
      this.saveToDisk(); // Сохраняем результаты игры
      return true;
    }

    // 3. Остался только один игрок (не Валет) - он побеждает
    if (alivePlayers.length === 1 && !alivePlayers[0].isJackOfHearts) {
      this.broadcastToRoom(roomId, {
        type: 'gameOver',
        winner: 'lastPlayer',
        message: `Победитель: ${alivePlayers[0].name}!`
      });
      this.saveToDisk(); // Сохраняем результаты игры
      return true;
    }

    // 4. Нет живых игроков (маловероятный сценарий, но на всякий случай) - ничья
    if (alivePlayers.length === 0) {
      this.broadcastToRoom(roomId, {
        type: 'gameOver',
        winner: 'draw',
        message: 'Ничья! Все игроки выбыли!'
      });
      this.saveToDisk(); // Сохраняем результаты игры
      return true;
    }

    // Если игра не закончена, начинаем новый раунд
    this.startNewRound(roomId);
    return false;
  }

  startNewRound(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.currentRound++;
    room.roundPhase = 'discussion';
    room.discussionTimeLeft = room.discussionTime; // Используем настраиваемое время обсуждения

    // Рассылаем обновленную информацию о других игроках
    for (const player of room.players) {
      if (!player.isDisconnected && player.ws && player.ws.readyState === WebSocket.OPEN) {
        // Формируем информацию о других игроках
        const otherPlayersInfo = room.players.map(p => ({
          id: p.id,
          name: p.name,
          card: p.id === player.id ? `${p.rank}?` : `${p.rank}${p.suit}`,
          suitSymbol: p.id === player.id ? '?' : p.suit,
          isAlive: p.isAlive,
          isJackOfHearts: false // Не показываем, что игрок - Червовый Валет другим игрокам
        }));

        player.ws.send(JSON.stringify({
          type: 'roundStarted',
          round: room.currentRound,
          players: otherPlayersInfo,
          discussionTime: room.discussionTime // Отправляем время обсуждения
        }));
      }
    }

    // Начинаем таймер обсуждения для нового раунда
    this.startDiscussionTimer(roomId);
  }

  // Получить список доступных комнат
  getAvailableRooms() {
    const availableRooms = [];

    for (const [roomId, room] of this.rooms) {
      // Добавляем только комнаты, в которых не началась игра
      if (!room.gameStarted) {
        availableRooms.push({
          id: roomId,
          name: `Комната ${roomId}`,
          players: room.players.length,
          maxPlayers: 10, // можно сделать настраиваемым
          hasPassword: !!room.password, // true если пароль установлен
          minPlayers: room.minPlayers,
          discussionTime: room.discussionTime,
          guessingTime: room.guessingTime
        });
      }
    }

    return availableRooms;
  }

  broadcastToRoom(roomId, message) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    for (const player of room.players) {
      if (!player.isDisconnected && player.ws && player.ws.readyState === WebSocket.OPEN) {
        try {
          player.ws.send(JSON.stringify(message));
        } catch (e) {
          console.error('Ошибка при отправке сообщения игроку:', e);
        }
      }
    }
  }

  sendPrivateMessage(roomId, fromPlayerId, toPlayerId, message) {
    const room = this.rooms.get(roomId);
    if (!room) {
      console.log('Комната не найдена для отправки приватного сообщения');
      return;
    }

    const fromPlayer = room.players.find(p => p.id === fromPlayerId);
    const toPlayer = room.players.find(p => p.id === toPlayerId);

    if (!fromPlayer || !toPlayer) {
      console.log('Не найден отправитель или получатель приватного сообщения');
      return;
    }

    if (!fromPlayer.isAlive || !toPlayer.isAlive) {
      console.log('Не удалось отправить приватное сообщение: один из игроков мертв');
      return;
    }

    // Отправляем сообщение только получателю
    if (toPlayer.ws && toPlayer.ws.readyState === WebSocket.OPEN) {
      toPlayer.ws.send(JSON.stringify({
        type: 'privateChatMessage',
        fromPlayerId: fromPlayerId,
        fromPlayerName: fromPlayer.name,
        message: message,
        timestamp: new Date().toLocaleTimeString()
      }));
    } else {
      console.log('Получатель недоступен для получения приватного сообщения');
    }
  }
}

const game = new Game();

wss.on('connection', (ws, req) => {
  console.log('Новое WebSocket соединение');

  // Генерируем ID для веб-сокета
  ws.id = Date.now() + Math.random();

  ws.on('message', (message) => {
    try {
      console.log('Получено сообщение:', message.toString());
      const data = JSON.parse(message);

      switch (data.type) {
        case 'createRoom':
          console.log(`Попытка создания комнаты: ${data.roomId}, игрок: ${data.playerName}`);
          try {
            // Проверяем, что пароль обязательно предоставлен
            if (!data.password) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Пароль комнаты обязателен'
              }));
              console.log('Ошибка при создании комнаты: пароль не предоставлен');
              return;
            }

            // Создаем комнату с пользовательскими параметрами
            game.createRoom(data.roomId, data.minPlayers || 6, data.discussionTime || 120, data.guessingTime || 60, data.password);

            const result = game.addPlayer(ws, data.roomId, data.playerName, data.password);
            if (result.success) {
              ws.playerId = result.player.id;
              ws.roomId = data.roomId;

              // Отправляем игроку его ID
              ws.send(JSON.stringify({
                type: 'joinedRoom',
                playerId: result.player.id,
                playerName: result.player.name
              }));

              console.log(`Игрок успешно создал комнату и присоединился: ${result.player.name}`);
            } else {
              ws.send(JSON.stringify({
                type: 'error',
                message: result.message
              }));
              console.log(`Ошибка при создании комнаты: ${result.message}`);
            }
          } catch (e) {
            console.error('Ошибка при создании комнаты:', e);
            ws.send(JSON.stringify({
              type: 'error',
              message: e.message || 'Произошла ошибка при создании комнаты'
            }));
          }
          break;

        case 'joinRoom':
          console.log(`Попытка присоединиться к комнате: ${data.roomId}, игрок: ${data.playerName}`);
          try {
            const password = data.password || null;
            const result = game.addPlayer(ws, data.roomId, data.playerName, password);
            if (result.success) {
              ws.playerId = result.player.id;
              ws.roomId = data.roomId;

              // Отправляем игроку его ID
              ws.send(JSON.stringify({
                type: 'joinedRoom',
                playerId: result.player.id,
                playerName: result.player.name
              }));

              console.log(`Игрок успешно присоединился: ${result.player.name}`);
            } else {
              ws.send(JSON.stringify({
                type: 'error',
                message: result.message
              }));
              console.log(`Ошибка при присоединении игрока: ${result.message}`);
            }
          } catch (e) {
            console.error('Ошибка при присоединении игрока:', e);
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Произошла ошибка при присоединении к комнате'
            }));
          }
          break;

        case 'chatMessage':
          if (ws.roomId) {
            game.broadcastToRoom(ws.roomId, {
              type: 'chatMessage',
              playerId: ws.playerId,
              playerName: data.playerName,
              message: data.message
            });
          }
          break;

        case 'privateChatMessage':
          if (ws.roomId && ws.playerId) {
            game.sendPrivateMessage(ws.roomId, ws.playerId, data.targetPlayerId, data.message);
          }
          break;

        case 'submitGuess':
          if (ws.roomId) {
            game.submitGuess(ws.roomId, ws.playerId, data.guess);
          }
          break;

        case 'getRoomList':
          // Отправляем список доступных комнат
          const availableRooms = game.getAvailableRooms();
          ws.send(JSON.stringify({
            type: 'roomList',
            rooms: availableRooms
          }));
          break;

        default:
          console.log('Получен неизвестный тип сообщения:', data.type);
      }
    } catch (e) {
      console.error('Ошибка при обработке сообщения:', e);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Ошибка при обработке сообщения'
      }));
    }
  });

  ws.on('close', () => {
    console.log('WebSocket соединение закрыто');
    if (ws.roomId && ws.playerId) {
      const room = game.rooms.get(ws.roomId);
      if (room) {
        const player = room.players.find(p => p.id === ws.playerId);
        if (player) {
          player.isDisconnected = true;

          // Если игрок был жив, он выбывает из игры
          if (player.isAlive) {
            player.isAlive = false;
            room.eliminatedPlayers.push({
              id: player.id,
              name: player.name,
              eliminatedBy: 'disconnect'
            });

            game.broadcastToRoom(ws.roomId, {
              type: 'playerDisconnected',
              playerName: player.name
            });

            // Обновляем информацию о других игроках
            game.updatePlayersInfoForNextRound(ws.roomId);
          }
        }
      }
    }
  });

  ws.on('error', (error) => {
    console.error('Ошибка WebSocket:', error);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер запущен на порту ${PORT} на всех интерфейсах`);
});