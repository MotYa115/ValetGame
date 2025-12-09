// Адрес сервера - измените эту константу, чтобы подключаться к другому серверу
const SERVER_ADDRESS = (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.
     location.host;

class GameClient {
  constructor() {
    this.ws = null;
    this.playerId = null;
    this.playerName = null;
    this.roomId = null;
    this.myRank = null;
    this.isJackOfHearts = false;
    this.players = [];
    this.gameStarted = false;
    this.currentRound = 1;
    this.roundPhase = 'waiting'; // waiting, discussion, guessing
    this.discussionTimeLeft = 0;
    this.guessingTimeLeft = 0;
    this.chatMessages = [];
    this.eliminatedPlayers = [];
    this.privateChats = {}; // Хранение приватных чатов
    this.currentPrivateChat = null; // Текущий приватный чат
    this.titleFlashInterval = null; // Для мигания заголовка при получении сообщений
    this.unreadPrivateMessages = {}; // Счетчик непрочитанных приватных сообщений по игрокам

    this.setupEventListeners();
  }

  setupEventListeners() {
    // Обработчики для главного меню
    const createServerBtn = document.getElementById('createServerBtn');
    if (createServerBtn) {
      createServerBtn.addEventListener('click', () => {
        this.showCreateServerModal();
      });
    }

    const connectToServerBtn = document.getElementById('connectToServerBtn');
    if (connectToServerBtn) {
      connectToServerBtn.addEventListener('click', () => {
        this.showConnectToServerModal();
      });
    }

    // Обработчики для модального окна создания сервера
    const confirmCreateServerBtn = document.getElementById('confirmCreateServerBtn');
    if (confirmCreateServerBtn) {
      confirmCreateServerBtn.addEventListener('click', () => {
        this.createServer();
      });
    }

    // Обработчики для модального окна подключения к серверу
    const confirmPasswordBtn = document.getElementById('confirmPasswordBtn');
    if (confirmPasswordBtn) {
      confirmPasswordBtn.addEventListener('click', () => {
        this.connectToServer();
      });
    }

    const refreshRoomsBtn = document.getElementById('refreshRoomsBtn');
    if (refreshRoomsBtn) {
      refreshRoomsBtn.addEventListener('click', () => {
        this.requestRoomList();
      });
    }

    const backToListBtn = document.getElementById('backToListBtn');
    if (backToListBtn) {
      backToListBtn.addEventListener('click', () => {
        this.showRoomList();
      });
    }

    // Обработчики для чата
    const sendChatBtn = document.getElementById('sendChatBtn');
    if (sendChatBtn) {
      sendChatBtn.addEventListener('click', () => {
        this.sendChatMessage();
      });
    }

    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
      chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.sendChatMessage();
        }
      });
    }

    // Обработчики для угадывания масти
    const submitGuessBtn = document.getElementById('submitGuessBtn');
    if (submitGuessBtn) {
      submitGuessBtn.addEventListener('click', () => {
        this.submitGuess();
      });
    }

    // Обработчики для приватного чата
    const sendPrivateChatBtn = document.getElementById('sendPrivateChatBtn');
    if (sendPrivateChatBtn) {
      sendPrivateChatBtn.addEventListener('click', () => {
        this.sendPrivateChatMessage();
      });
    }

    const privateChatInput = document.getElementById('privateChatInput');
    if (privateChatInput) {
      privateChatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.sendPrivateChatMessage();
        }
      });
    }
  }

  showCreateServerModal() {
    const modalElement = document.getElementById('createServerModal');
    if (modalElement) {
      const modal = bootstrap.Modal.getOrCreateInstance(modalElement);
      modal.show();
    }
  }

  showConnectToServerModal() {
    const modalElement = document.getElementById('connectToServerModal');
    if (modalElement) {
      const modal = bootstrap.Modal.getOrCreateInstance(modalElement);
      modal.show();
    }
  }

  createServer() {
    const playerName = document.getElementById('createPlayerName').value.trim();
    let roomId = document.getElementById('createRoomId').value.trim();
    const roomPassword = document.getElementById('createRoomPassword').value.trim();
    const minPlayers = document.getElementById('createMinPlayers').value.trim();
    const discussionTimer = document.getElementById('discussionTimer').value.trim();
    const guessingTimer = document.getElementById('guessingTimer').value.trim();

    // Сначала удаляем все предыдущие ошибки
    this.clearValidationErrors();

    let hasError = false;

    if (!playerName) {
      this.showValidationError('createPlayerName', 'Введите имя игрока');
      hasError = true;
    }

    if (!roomPassword) {
      this.showValidationError('createRoomPassword', 'Введите пароль комнаты');
      hasError = true;
    }

    if (!minPlayers || minPlayers < 3 || minPlayers > 10) {
      this.showValidationError('createMinPlayers', 'Количество игроков должно быть от 3 до 10');
      hasError = true;
    }

    if (!discussionTimer || discussionTimer < 30 || discussionTimer > 600) {
      this.showValidationError('discussionTimer', 'Время обсуждения должно быть от 30 до 600 секунд');
      hasError = true;
    }

    if (!guessingTimer || guessingTimer < 10 || guessingTimer > 300) {
      this.showValidationError('guessingTimer', 'Время угадывания должно быть от 10 до 300 секунд');
      hasError = true;
    }

    if (hasError) {
      return;
    }

    // Если roomId пустой, генерируем его
    if (!roomId) {
      roomId = this.generateRoomId();
      document.getElementById('createRoomId').value = roomId;
    }

    console.log(`Попытка создания комнаты с ID ${roomId} и именем ${playerName}`);

    this.playerName = playerName;
    this.roomId = roomId;

    // Подключаемся к серверу
    try {
      this.ws = new WebSocket(SERVER_ADDRESS);

      this.ws.onopen = () => {
        console.log('Подключено к серверу');
        console.log('Отправляем запрос на создание комнаты...');

        // Отправляем запрос на создание комнаты
        this.ws.send(JSON.stringify({
          type: 'createRoom',
          roomId: this.roomId,
          playerName: this.playerName,
          password: roomPassword || null, // Отправляем пароль, если он есть
          minPlayers: parseInt(minPlayers),
          discussionTime: parseInt(discussionTimer),
          guessingTime: parseInt(guessingTimer)
        }));

        // Закрываем модальное окно
        const modalElement = document.getElementById('createServerModal');
        if (modalElement) {
          const modal = bootstrap.Modal.getOrCreateInstance(modalElement);
          modal.hide();
        }

        // Обновляем список комнат
        setTimeout(() => {
          this.requestRoomList();
        }, 1000); // Задержка, чтобы комната успела создаться на сервере
      };

      this.ws.onmessage = (event) => {
        console.log('Получено сообщение от сервера:', event.data);
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (e) {
          console.error('Ошибка при разборе сообщения:', e);
        }
      };

      this.ws.onerror = (error) => {
        console.error('Ошибка WebSocket:', error);
        // Удаляем ошибки валидации при сетевых ошибках
        this.clearValidationErrors();
        alert('Ошибка подключения к серверу. Проверьте, запущен ли сервер.');
      };

      this.ws.onclose = () => {
        console.log('Соединение закрыто');
        // Удаляем ошибки валидации при закрытии соединения
        this.clearValidationErrors();
        alert('Соединение с сервером закрыто.');
      };
    } catch (e) {
      console.error('Ошибка при создании WebSocket соединения:', e);
      // Удаляем ошибки валидации при ошибках создания соединения
      this.clearValidationErrors();
      alert('Не удалось создать соединение с сервером.');
    }
  }

  connectToServer() {
    // Всегда используем данные из формы подключения с паролем
    const playerName = document.getElementById('connectPlayerName').value.trim();
    const roomPassword = document.getElementById('roomPassword').value.trim();
    const roomId = document.getElementById('hiddenRoomId').value.trim();

    // Сначала удаляем все предыдущие ошибки
    this.clearValidationErrors();

    let hasError = false;

    if (!playerName) {
      this.showValidationError('connectPlayerName', 'Введите имя игрока');
      hasError = true;
    }

    if (!roomPassword) {
      this.showValidationError('roomPassword', 'Введите пароль комнаты');
      hasError = true;
    }

    if (!roomId) {
      hasError = true;
    }

    if (hasError) {
      return;
    }

    console.log(`Попытка подключения к комнате ${roomId} с именем ${playerName}`);

    this.playerName = playerName;
    this.roomId = roomId;

    // Подключаемся к серверу
    try {
      this.ws = new WebSocket(SERVER_ADDRESS);

      this.ws.onopen = () => {
        console.log('Подключено к серверу');
        console.log('Отправляем запрос на присоединение к комнате...');

        // Отправляем запрос на присоединение к комнате
        this.ws.send(JSON.stringify({
          type: 'joinRoom',
          roomId: this.roomId,
          playerName: this.playerName,
          password: roomPassword
        }));

        // Закрываем модальное окно
        const modalElement = document.getElementById('connectToServerModal');
        if (modalElement) {
          const modal = bootstrap.Modal.getOrCreateInstance(modalElement);
          modal.hide();
        }
      };

      this.ws.onmessage = (event) => {
        console.log('Получено сообщение от сервера:', event.data);
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (e) {
          console.error('Ошибка при разборе сообщения:', e);
        }
      };

      this.ws.onerror = (error) => {
        console.error('Ошибка WebSocket:', error);
        // Удаляем ошибки валидации при сетевых ошибках
        this.clearValidationErrors();
        alert('Ошибка подключения к серверу. Проверьте, запущен ли сервер.');
      };

      this.ws.onclose = () => {
        console.log('Соединение закрыто');
        // Удаляем ошибки валидации при закрытии соединения
        this.clearValidationErrors();
        alert('Соединение с сервером закрыто.');
      };
    } catch (e) {
      console.error('Ошибка при создании WebSocket соединения:', e);
      // Удаляем ошибки валидации при ошибках создания соединения
      this.clearValidationErrors();
      alert('Не удалось создать соединение с серверу.');
    }
  }

  // Подключиться к комнате с паролем
  connectToRoomWithPassword() {
    const playerName = document.getElementById('connectPlayerName').value.trim();
    const roomPassword = document.getElementById('roomPassword').value.trim();
    const roomId = document.getElementById('hiddenRoomId').value.trim();

    // Сначала удаляем все предыдущие ошибки
    this.clearValidationErrors();

    let hasError = false;

    if (!playerName) {
      this.showValidationError('connectPlayerName', 'Введите имя игрока');
      hasError = true;
    }

    if (!roomPassword) {
      this.showValidationError('roomPassword', 'Введите пароль комнаты');
      hasError = true;
    }

    if (!roomId) {
      hasError = true;
    }

    if (hasError) {
      return;
    }

    console.log(`Попытка подключения к комнате ${roomId} с паролем и именем ${playerName}`);

    this.playerName = playerName;
    this.roomId = roomId;

    // Подключаемся к серверу
    try {
      this.ws = new WebSocket(SERVER_ADDRESS);

      this.ws.onopen = () => {
        console.log('Подключено к серверу');
        console.log('Отправляем запрос на присоединение к комнате с паролем...');

        // Отправляем запрос на присоединение к комнате с паролем
        this.ws.send(JSON.stringify({
          type: 'joinRoom',
          roomId: this.roomId,
          playerName: this.playerName,
          password: roomPassword
        }));

        // Закрываем модальное окно
        const modalElement = document.getElementById('connectToServerModal');
        if (modalElement) {
          const modal = bootstrap.Modal.getOrCreateInstance(modalElement);
          modal.hide();
        }
      };

      this.ws.onmessage = (event) => {
        console.log('Получено сообщение от сервера:', event.data);
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (e) {
          console.error('Ошибка при разборе сообщения:', e);
        }
      };

      this.ws.onerror = (error) => {
        console.error('Ошибка WebSocket:', error);
        // Удаляем ошибки валидации при сетевых ошибках
        this.clearValidationErrors();
        alert('Ошибка подключения к серверу. Проверьте, запущен ли сервер.');
      };

      this.ws.onclose = () => {
        console.log('Соединение закрыто');
        // Удаляем ошибки валидации при закрытии соединения
        this.clearValidationErrors();
        alert('Соединение с сервером закрыто.');
      };
    } catch (e) {
      console.error('Ошибка при создании WebSocket соединения:', e);
      // Удаляем ошибки валидации при ошибках создания соединения
      this.clearValidationErrors();
      alert('Не удалось создать соединение с сервером.');
    }
  }

  // Запросить список комнат
  requestRoomList() {
    // Отправляем запрос на получение списка комнат
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'getRoomList'
      }));

      // Показываем индикатор загрузки
      const roomListElement = document.getElementById('roomList');
      if (roomListElement) {
        roomListElement.innerHTML = `
          <div class="list-group-item text-center text-muted py-3">
            <i class="fas fa-spinner fa-spin me-2"></i>Загрузка списка комнат...
          </div>
        `;
      }
    } else {
      // Если нет соединения, пытаемся создать его для получения списка комнат
      try {
        const tempWs = new WebSocket(SERVER_ADDRESS);

        tempWs.onopen = () => {
          console.log('Подключено к серверу для получения списка комнат');
          tempWs.send(JSON.stringify({
            type: 'getRoomList'
          }));
        };

        tempWs.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'roomList') {
              this.displayRoomList(data.rooms);
              tempWs.close();
            }
          } catch (e) {
            console.error('Ошибка при обработке списка комнат:', e);
            tempWs.close();
          }
        };

        tempWs.onerror = (error) => {
          console.error('Ошибка WebSocket при получении списка комнат:', error);
          const roomListElement = document.getElementById('roomList');
          if (roomListElement) {
            roomListElement.innerHTML = `
              <div class="list-group-item text-center text-muted py-3">
                <i class="fas fa-exclamation-triangle me-2"></i>Ошибка загрузки комнат
              </div>
            `;
          }
        };

        tempWs.onclose = () => {
          console.log('Соединение для получения списка комнат закрыто');
        };
      } catch (e) {
        console.error('Ошибка при создании соединения для получения списка комнат:', e);
        const roomListElement = document.getElementById('roomList');
        if (roomListElement) {
          roomListElement.innerHTML = `
            <div class="list-group-item text-center text-muted py-3">
              <i class="fas fa-exclamation-triangle me-2"></i>Ошибка подключения к серверу
            </div>
          `;
        }
      }
    }
  }

  // Отобразить список комнат
  displayRoomList(rooms) {
    const roomListElement = document.getElementById('roomList');
    if (roomListElement) {
      if (rooms && rooms.length > 0) {
        roomListElement.innerHTML = '';

        rooms.forEach(room => {
          const roomItem = document.createElement('div');
          roomItem.className = 'list-group-item list-group-item-action';
          roomItem.innerHTML = `
            <div class="d-flex justify-content-between align-items-center">
              <div>
                <div class="fw-bold">${room.name}</div>
                <small class="text-muted">
                  ID: ${room.id} |
                  Игроков: ${room.players}/${room.maxPlayers} |
                  Мин. для старта: ${room.minPlayers}
                </small>
              </div>
              <div class="d-flex align-items-center">
                <span class="badge bg-warning me-2"><i class="fas fa-lock"></i> Защищено</span>
                <button class="btn btn-sm btn-primary join-room-btn" data-room-id="${room.id}">
                  Присоединиться
                </button>
              </div>
            </div>
          `;

          // Добавляем обработчик для кнопки присоединения
          const joinBtn = roomItem.querySelector('.join-room-btn');
          joinBtn.addEventListener('click', () => {
            this.showPasswordInput(room.id);
          });

          roomListElement.appendChild(roomItem);
        });
      } else {
        roomListElement.innerHTML = `
          <div class="list-group-item text-center text-muted py-3">
            <i class="fas fa-inbox me-2"></i>Нет доступных комнат
          </div>
        `;
      }
    }
  }

  // Показать форму ввода пароля для комнаты
  showPasswordInput(roomId) {
    const roomListSection = document.getElementById('roomListSection');
    const passwordSection = document.getElementById('passwordSection');

    // Устанавливаем ID комнаты в скрытое поле
    document.getElementById('hiddenRoomId').value = roomId;
    document.getElementById('passwordRoomIdDisplay').textContent = roomId;

    if (roomListSection) roomListSection.classList.add('d-none');
    if (passwordSection) passwordSection.classList.remove('d-none');

    // Показываем кнопки в футере
    document.getElementById('backToListBtn').style.display = 'inline-block';
    document.getElementById('confirmPasswordBtn').style.display = 'inline-block';
  }

  // Показать список комнат
  showRoomList() {
    const roomListSection = document.getElementById('roomListSection');
    const passwordSection = document.getElementById('passwordSection');

    if (roomListSection) roomListSection.classList.remove('d-none');
    if (passwordSection) passwordSection.classList.add('d-none');

    // Показываем кнопки в футере
    document.getElementById('backToListBtn').style.display = 'none';
    document.getElementById('confirmPasswordBtn').style.display = 'inline-block';
  }

  // Показывает ошибку валидации для конкретного поля
  showValidationError(fieldId, message) {
    const field = document.getElementById(fieldId);
    if (field) {
      field.classList.add('is-invalid');

      // Удаляем предыдущее сообщение об ошибке, если оно есть
      let errorElement = field.parentNode.querySelector('.invalid-feedback');
      if (!errorElement) {
        errorElement = document.createElement('div');
        errorElement.className = 'invalid-feedback';
        field.parentNode.appendChild(errorElement);
      }

      errorElement.textContent = message;
    }
  }

  // Удаляет все ошибки валидации
  clearValidationErrors() {
    const invalidFields = document.querySelectorAll('.is-invalid');
    invalidFields.forEach(field => {
      field.classList.remove('is-invalid');
    });

    const errorMessages = document.querySelectorAll('.invalid-feedback');
    errorMessages.forEach(message => {
      message.remove();
    });
  }


  generateRoomId() {
    // Генерирует случайный ID комнаты
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  handleMessage(data) {
    console.log('Обработка сообщения от сервера:', data);

    switch (data.type) {
      case 'joinedRoom': {
        console.log('Получено сообщение о присоединении:', data);
        this.playerId = data.playerId;
        this.playerName = data.playerName;

        // Скрываем главное меню и показываем игровой экран
        const mainMenuElement = document.getElementById('mainMenu');
        const gameScreenElement = document.getElementById('gameScreen');

        if (mainMenuElement) mainMenuElement.classList.add('d-none');
        if (gameScreenElement) gameScreenElement.classList.remove('d-none');

        // Отображаем ID комнаты
        const roomIdDisplay = document.getElementById('roomIdDisplay');
        if (roomIdDisplay) {
          roomIdDisplay.textContent = this.roomId;
        }
        break;
      }

      case 'error': {
        console.error('Получена ошибка от сервера:', data.message);
        alert(data.message);
        break;
      }

      case 'gameStarted': {
        this.gameStarted = true;
        // Проверяем, есть ли ранг в playerData (старый способ)
        if (data.playerData.rank) {
          this.myRank = data.playerData.rank;
        } else {
          // Если нет, ищем ранг в списке otherPlayers
          const myPlayerInfo = data.otherPlayers.find(p => p.id === this.playerId && p.rank);
          if (myPlayerInfo && myPlayerInfo.rank) {
            this.myRank = myPlayerInfo.rank;
          }
        }

        this.isJackOfHearts = data.playerData.isJackOfHearts;

        // Обновляем отображение своей карты
        this.updateMyCardDisplay();

        // Обновляем список других игроков
        this.players = data.otherPlayers;
        this.updatePlayersList();

        // Скрываем блок догадки в начале игры (на фазе обсуждения)
        const guessingAreaElement = document.getElementById('guessingArea');
        if (guessingAreaElement) {
          guessingAreaElement.classList.add('d-none');
        }

        if (this.isJackOfHearts) {
          const isJackBadge = document.getElementById('isJackBadge');
          if (isJackBadge) isJackBadge.style.display = 'inline-block';
        }
        break;
      }

      case 'playersInfo': {
        // Обновляем информацию о картах других игроков
        this.players = data.players;

        // Ищем информацию о себе в списке, чтобы обновить свою карту
        const myPlayerInfo = data.players.find(p => p.id === this.playerId);
        if (myPlayerInfo && myPlayerInfo.rank) {
          // Обновляем информацию о своей карте
          this.myRank = myPlayerInfo.rank;
          this.updateMyCardDisplay();
        }

        this.updatePlayersList();
        break;
      }

      case 'roomList': {
        // Обрабатываем полученный список комнат
        this.displayRoomList(data.rooms);
        break;
      }

      case 'roundStarted': {
        this.currentRound = data.round;
        this.roundPhase = 'discussion';
        const roundNumberElement = document.getElementById('roundNumber');
        const phaseNameElement = document.getElementById('phaseName');
        const timerElement = document.getElementById('timer');

        if (roundNumberElement) roundNumberElement.textContent = data.round;
        if (phaseNameElement) phaseNameElement.textContent = 'Обсуждение';
        if (timerElement) timerElement.textContent = data.discussionTime; // Используем динамическое время с сервера

        this.players = data.players;
        this.updatePlayersList();

        // Скрываем области результатов и догадки
        const guessResultsAreaElement = document.getElementById('guessResultsArea');
        const guessingAreaElement = document.getElementById('guessingArea');
        const guessingInstructionElement = document.getElementById('guessingInstruction');

        if (guessResultsAreaElement) guessResultsAreaElement.classList.add('d-none');
        if (guessingAreaElement) guessingAreaElement.classList.add('d-none'); // Скрываем область угадывания на фазе обсуждения
        if (guessingInstructionElement) guessingInstructionElement.textContent = 'В конце раунда угадайте масть своей карты';

        // Возвращаем возможность угадывать в следующем раунде
        const submitGuessBtnElement = document.getElementById('submitGuessBtn');
        if (submitGuessBtnElement) {
          submitGuessBtnElement.disabled = true;
          submitGuessBtnElement.textContent = 'Отправить догадку';
        }
        break;
      }

      case 'timerUpdate': {
        if (data.phase === 'discussion') {
          this.discussionTimeLeft = data.timeLeft;
          const timerElement = document.getElementById('timer');
          if (timerElement) timerElement.textContent = data.timeLeft;
        } else if (data.phase === 'guessing') {
          this.guessingTimeLeft = data.timeLeft;
          const timerElement = document.getElementById('timer');
          if (timerElement) timerElement.textContent = data.timeLeft;
        }
        break;
      }

      case 'guessingPhaseStarted': {
        this.roundPhase = 'guessing';
        const phaseNameElement = document.getElementById('phaseName');
        const guessResultsAreaElement = document.getElementById('guessResultsArea');
        const guessingAreaElement = document.getElementById('guessingArea');
        const submitGuessBtnElement = document.getElementById('submitGuessBtn');
        const guessingInstructionElement = document.getElementById('guessingInstruction');

        if (phaseNameElement) phaseNameElement.textContent = 'Угадывание';
        if (guessResultsAreaElement) guessResultsAreaElement.classList.add('d-none');
        if (guessingAreaElement) guessingAreaElement.classList.remove('d-none'); // Показываем область угадывания
        if (submitGuessBtnElement) submitGuessBtnElement.disabled = false;
        if (guessingInstructionElement) guessingInstructionElement.textContent = 'Угадайте масть своей карты';

        // Показываем таймер угадывания
        const timerElement = document.getElementById('timer');
        if (timerElement) timerElement.textContent = this.guessingTimeLeft;
        break;
      }

      case 'guessSubmitted': {
        // Показываем, что догадка отправлена
        const submitGuessBtnElement = document.getElementById('submitGuessBtn');
        if (submitGuessBtnElement) {
          submitGuessBtnElement.disabled = true;
          submitGuessBtnElement.innerHTML = '<i class="fas fa-check me-2"></i>Отправлено!';
          setTimeout(() => {
            if (submitGuessBtnElement) submitGuessBtnElement.innerHTML = '<i class="fas fa-paper-plane me-2"></i>Отправить догадку';
          }, 2000);
        }
        break;
      }

      case 'guessResults': {
        this.roundPhase = 'discussion'; // Переходим к следующему раунду

        // Показываем результаты угадывания
        this.displayGuessResults(data.incorrectGuesses);

        // Скрываем окно догадки
        const guessingAreaElement = document.getElementById('guessingArea');
        const guessingInstructionElement = document.getElementById('guessingInstruction');

        if (guessingAreaElement) guessingAreaElement.classList.add('d-none'); // Скрываем область угадывания
        if (guessingInstructionElement) guessingInstructionElement.textContent = 'В следующем раунде угадайте масть своей карты';
        break;
      }

      case 'gameOver': {
        const gameScreenElement = document.getElementById('gameScreen');
        const gameOverScreenElement = document.getElementById('gameOverScreen');
        const gameResultElement = document.getElementById('gameResult');

        if (gameScreenElement) gameScreenElement.classList.add('d-none');
        if (gameOverScreenElement) gameOverScreenElement.classList.remove('d-none');

        // Отображаем результат в зависимости от типа окончания игры
        if (data.winner === 'draw') {
          // Специальное сообщение для ничьей
          if (gameResultElement) gameResultElement.textContent = 'Ничья! Все игроки выбыли!';
        } else {
          if (gameResultElement) gameResultElement.textContent = data.message;
        }
        break;
      }

      case 'chatMessage': {
        this.addChatMessage({
          type: 'chat',
          playerId: data.playerId,
          playerName: data.playerName,
          message: data.message,
          timestamp: new Date().toLocaleTimeString()
        });
        break;
      }

      case 'privateChatMessage': {
        // Получение приватного сообщения от другого игрока
        this.receivePrivateChatMessage(data.fromPlayerId, data.fromPlayerName, data.message, data.timestamp);
        break;
      }

      case 'playerDisconnected': {
        // Обновляем список игроков
        this.updatePlayersList();

        // Добавляем сообщение в чат
        this.addChatMessage({
          type: 'system',
          message: `Игрок ${data.playerName} отключился и выбыл из игры`,
          timestamp: new Date().toLocaleTimeString()
        });
        break;
      }

      default: {
        console.log('Получен неизвестный тип сообщения:', data.type);
      }
    }
  }

  updateMyCardDisplay() {
    const myCardElement = document.getElementById('myCard');
    if (myCardElement) {
      myCardElement.innerHTML = `
        <div class="text-uppercase">Ваша карта: <strong>${this.myRank}?</strong></div>
        <div class="text-light-emphasis fst-italic">Масть вашей карты скрыта</div>
      `;
    }
  }

  updatePlayersList() {
    const container = document.getElementById('playersList');
    if (!container) return;

    container.innerHTML = '';

    // Отфильтруем своих игроков и покажем только других
    const otherPlayers = this.players ? this.players.filter(player => player.id !== this.playerId) : [];

    if (otherPlayers.length === 0) {
      container.innerHTML = '<div class="text-center text-muted py-4"><i class="fas fa-user-friends fa-2x mb-2"></i><p>Других игроков нет</p></div>';
      return;
    }

    otherPlayers.forEach(player => {
      const playerDiv = document.createElement('div');
      playerDiv.className = `col-md-6 mb-3`;

      const cardClass = `player-card ${player.isAlive ? 'alive' : 'eliminated'}`;

      // Преобразуем символ масти в текстовое обозначение
      const suitText = this.getSuitText(player.suitSymbol);

      playerDiv.innerHTML = `
        <div class="${cardClass}" onclick="gameClient.openPrivateChat(${player.id}, '${player.name}')">
          <div class="player-name d-flex justify-content-between align-items-center">
            <span>${player.name}</span>
            <span class="badge ${player.isAlive ? 'bg-success' : 'bg-secondary'}">
              ${player.isAlive ? '<i class="fas fa-circle"></i>' : '<i class="fas fa-skull"></i>'}
            </span>
          </div>
          <div class="player-card-content">
            ${player.card} <small class="text-muted">(${suitText})</small>
          </div>
          <div class="text-center mt-2">
            <span class="badge ${player.isAlive ? 'bg-success' : 'bg-secondary'} py-2 px-3">
              ${player.isAlive ? '<i class="fas fa-life-ring me-1"></i> Жив' : '<i class="fas fa-times-circle me-1"></i> Выбыл'}
            </span>
          </div>
        </div>
      `;

      container.appendChild(playerDiv);
    });
  }

  getSuitText(suitSymbol) {
    switch(suitSymbol) {
      case '♠': return 'Пики';
      case '♥': return 'Червы';
      case '♦': return 'Бубны';
      case '♣': return 'Трефы';
      case '?': return 'Скрыто';
      default: return 'Неизвестно';
    }
  }


  submitGuess() {
    const guessSelect = document.getElementById('suitGuess');
    if (!guessSelect) return;

    const guess = guessSelect.value;

    if (!guess) {
      alert('Пожалуйста, выберите масть');
      return;
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'submitGuess',
        guess: guess
      }));

      // Добавляем сообщение в чат
      const suitNames = {
        '♠': 'Пики',
        '♥': 'Червы',
        '♦': 'Бубны',
        '♣': 'Трефы'
      };

      this.addChatMessage({
        type: 'system',
        message: `Вы угадываете: ${suitNames[guess]} <i class="suit-icon ${guess}">${guess}</i>`,
        timestamp: new Date().toLocaleTimeString()
      });
    }
  }

  displayGuessResults(incorrectGuesses) {
    const resultsArea = document.getElementById('guessResultsArea');
    if (!resultsArea) return;

    resultsArea.classList.remove('d-none');

    const resultsList = document.getElementById('guessResultsList');
    if (!resultsList) return;

    resultsList.innerHTML = '';

    if (incorrectGuesses.length === 0) {
      const noMistakes = document.createElement('div');
      noMistakes.className = 'alert alert-success text-center py-3';
      noMistakes.innerHTML = '<i class="fas fa-check-circle fa-2x mb-2"></i><p class="mb-0"><strong>Ура!</strong> Все игроки угадали правильно!</p>';
      resultsList.appendChild(noMistakes);
    } else {
      const heading = document.createElement('h6');
      heading.className = 'text-danger';
      heading.innerHTML = '<i class="fas fa-exclamation-triangle me-2"></i>Неправильные догадки:';
      resultsList.appendChild(heading);

      incorrectGuesses.forEach(guess => {
        const resultItem = document.createElement('div');
        resultItem.className = 'guess-result-item guess-result-incorrect mb-2 rounded';
        const suitNames = {
          '♠': 'Пики',
          '♥': 'Червы',
          '♦': 'Бубны',
          '♣': 'Трефы'
        };

        // Определяем, угадал ли игрок
        const isCorrect = guess.guess === guess.correctSuit;
        const icon = isCorrect ? 'fa-check-circle text-success' : 'fa-times-circle text-danger';
        const resultClass = isCorrect ? 'guess-result-correct' : 'guess-result-incorrect';
        resultItem.className = `guess-result-item ${resultClass} p-3 rounded-3 mb-2`;

        resultItem.innerHTML = `
          <div class="d-flex justify-content-between align-items-center">
            <strong>${guess.name}</strong>
            <i class="fas ${icon}"></i>
          </div>
          <div class="mt-2">
            Угадал: ${guess.guess === 'не угадал' ? '<span class="text-danger">не успел</span>' : `<span class="suit-icon ${guess.guess}">${guess.guess}</span> ${suitNames[guess.guess]}`}
            | На самом деле: <span class="suit-icon ${guess.correctSuit}">${guess.correctSuit}</span> ${suitNames[guess.correctSuit]}
          </div>
        `;
        resultsList.appendChild(resultItem);
      });
    }
  }

  sendChatMessage() {
    const input = document.getElementById('chatInput');
    if (!input) return;

    const message = input.value.trim();

    if (message && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'chatMessage',
        playerName: this.playerName,
        message: message
      }));

      input.value = '';
    }
  }

  addChatMessage(data) {
    // Добавляем сообщение в историю
    this.chatMessages.push(data);

    // Ограничиваем количество сообщений (последние 100)
    if (this.chatMessages.length > 100) {
      this.chatMessages = this.chatMessages.slice(-100);
    }

    // Обновляем отображение чата
    this.renderChatMessages();

    // Прокручиваем чат вниз
    const chatContainer = document.getElementById('chatMessages');
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }

  renderChatMessages() {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    container.innerHTML = '';

    if (this.chatMessages.length === 0) {
      container.innerHTML = '<div class="text-center text-light opacity-75 my-5"><i class="fas fa-comment-sms fa-2x mb-3"></i><p class="mb-0">Сообщений пока нет...</p></div>';
      return;
    }

    this.chatMessages.forEach(msg => {
      const messageDiv = document.createElement('div');

      if (msg.type === 'system') {
        messageDiv.className = 'chat-message system alert alert-info';
        messageDiv.innerHTML = `
          <div class="d-flex justify-content-between">
            <small class="text-muted"><i class="fas fa-info-circle me-1"></i>${msg.timestamp}</small>
          </div>
          <div>${msg.message}</div>
        `;
      } else {
        const isOwnMessage = msg.playerName === this.playerName;
        messageDiv.className = `chat-message ${isOwnMessage ? 'own' : ''} rounded-4 p-3`;
        messageDiv.innerHTML = `
          <div class="d-flex justify-content-between mb-1">
            <strong class="${isOwnMessage ? 'text-primary' : 'text-dark'}">${msg.playerName}</strong>
            <small class="text-muted">${msg.timestamp}</small>
          </div>
          <div>${msg.message}</div>
        `;
      }

      container.appendChild(messageDiv);
    });

    // Прокручиваем чат вниз
    container.scrollTop = container.scrollHeight;
  }

  openPrivateChat(playerId, playerName) {
    // Проверяем, жив ли игрок
    const player = this.players ? this.players.find(p => p.id == playerId) : null;
    if (!player || !player.isAlive) {
      alert('Нельзя начать чат с выбывшим игроком');
      return;
    }

    // Инициализируем приватный чат, если его еще нет
    if (!this.privateChats[playerId]) {
      this.privateChats[playerId] = [];
    }

    this.currentPrivateChat = playerId;

    // Обновляем заголовок модального окна
    const chattingWith = document.getElementById('chattingWith');
    if (chattingWith) chattingWith.textContent = playerName;

    // Отображаем сообщения приватного чата
    this.renderPrivateChatMessages();

    // Убираем уведомление для этого игрока и сбрасываем счетчик
    this.removeNotificationForPlayer(playerId, playerName);

    // Открываем модальное окно
    const modalElement = document.getElementById('privateChatModal');
    if (modalElement) {
      const modal = bootstrap.Modal.getOrCreateInstance(modalElement);
      modal.show();
    }
  }

  // Удаляем уведомление для игрока и сбрасываем счетчик непрочитанных сообщений
  removeNotificationForPlayer(playerId, playerName) {
    // Находим элемент игрока в списке
    const playerElement = document.querySelector(`.player-card[onclick*="openPrivateChat(${playerId}, '${playerName}')"]`);
    if (playerElement) {
      // Находим и скрываем/удаляем уведомление
      const notification = playerElement.querySelector('.notification-badge');
      if (notification) {
        notification.style.display = 'none';
      }
    }

    // Сбрасываем счетчик непрочитанных сообщений
    this.unreadPrivateMessages[playerId] = 0;
  }

  receivePrivateChatMessage(fromPlayerId, fromPlayerName, message, timestamp) {
    // Добавляем сообщение в приватный чат
    const chatMessage = {
      sender: fromPlayerName,
      message: message,
      timestamp: timestamp,
      isOwn: false
    };

    if (!this.privateChats[fromPlayerId]) {
      this.privateChats[fromPlayerId] = [];
    }

    this.privateChats[fromPlayerId].push(chatMessage);

    // Увеличиваем счетчик непрочитанных сообщений
    if (!this.unreadPrivateMessages[fromPlayerId]) {
      this.unreadPrivateMessages[fromPlayerId] = 0;
    }
    this.unreadPrivateMessages[fromPlayerId]++;

    // Если это текущий активный чат, обновляем отображение
    if (this.currentPrivateChat == fromPlayerId) {
      this.renderPrivateChatMessages();
    }

    // Показываем уведомление, если чат не активен
    if (this.currentPrivateChat != fromPlayerId) {
      // Визуальное уведомление о новом сообщении на иконке отправителя с обновленным счетчиком
      this.showNotificationForPlayer(fromPlayerId, fromPlayerName);

      // Меняем заголовок страницы для привлечения внимания (для каждого сообщения)
      this.flashTitle(`Новое сообщение от ${fromPlayerName}!`);

      // Дополнительно выделяем элемент игрока с анимацией для каждого сообщения
      const playerElement = document.querySelector(`.player-card[onclick*="openPrivateChat(${fromPlayerId}, '${fromPlayerName}')"]`);
      if (playerElement) {
        playerElement.classList.add('notification-active');
        // Убираем класс через некоторое время
        setTimeout(() => {
          playerElement.classList.remove('notification-active');
        }, 2000);
      }

      console.log(`Новое приватное сообщение от ${fromPlayerName}: ${message}`);
    }
  }

  // Метод для мигания заголовка страницы
  flashTitle(newMessage) {
    if (this.titleFlashInterval) {
      clearInterval(this.titleFlashInterval);
    }

    let originalTitle = document.title;
    let flashStep = 0;

    this.titleFlashInterval = setInterval(() => {
      document.title = (flashStep % 2) ? newMessage : originalTitle;
      flashStep++;

      if (flashStep > 6) { // Мигаем 3 раза
        clearInterval(this.titleFlashInterval);
        document.title = originalTitle;
        this.titleFlashInterval = null;
      }
    }, 800);
  }

  // Показываем уведомление на иконке игрока
  showNotificationForPlayer(playerId, playerName) {
    // Находим элемент игрока в списке
    const playerElement = document.querySelector(`.player-card[onclick*="openPrivateChat(${playerId}, '${playerName}')"]`);
    if (playerElement) {
      // Добавляем класс для визуального выделения игрока
      playerElement.classList.add('notification-active');

      // Проверяем, есть ли уже уведомление
      let notification = playerElement.querySelector('.notification-badge');

      if (!notification) {
        // Создаем элемент уведомления
        notification = document.createElement('span');
        notification.className = 'notification-badge';
        notification.innerHTML = this.unreadPrivateMessages[playerId] || '1';
        notification.title = `Непрочитанных сообщений: ${this.unreadPrivateMessages[playerId] || 1}`;

        playerElement.style.position = 'relative';
        playerElement.appendChild(notification);

        // Добавляем анимацию появления
        setTimeout(() => {
          notification.classList.add('bounce');
        }, 100);
      } else {
        // Обновляем содержимое уведомления с учетом количества непрочитанных сообщений
        notification.innerHTML = this.unreadPrivateMessages[playerId] || '1';
        notification.title = `Непрочитанных сообщений: ${this.unreadPrivateMessages[playerId] || 1}`;

        // Добавляем мигающий эффект при каждом новом сообщении
        notification.classList.add('blink');

        // Убираем класс blink после анимации, чтобы избежать постоянного мигания
        setTimeout(() => {
          notification.classList.remove('blink');
        }, 3000);
      }

      // Удаляем класс выделения и уведомление через 10 секунд, если пользователь не открыл чат
      setTimeout(() => {
        playerElement.classList.remove('notification-active');

        if (notification && notification.parentNode) {
          notification.style.display = 'none';
        }
      }, 10000);
    }
  }

  renderPrivateChatMessages() {
    const container = document.getElementById('privateChatMessages');
    if (!container) return;

    container.innerHTML = '';

    if (!this.currentPrivateChat || !this.privateChats[this.currentPrivateChat]) {
      container.innerHTML = '<div class="text-center text-muted py-5"><i class="fas fa-lock fa-2x mb-2"></i><p class="mb-0">Сообщений пока нет...</p></div>';
      return;
    }

    const messages = this.privateChats[this.currentPrivateChat];
    if (messages.length === 0) {
      container.innerHTML = '<div class="text-center text-muted py-5"><i class="fas fa-lock fa-2x mb-2"></i><p class="mb-0">Сообщений пока нет...</p></div>';
      // Сбрасываем счетчик непрочитанных сообщений
      this.unreadPrivateMessages[this.currentPrivateChat] = 0;
      return;
    }

    messages.forEach(msg => {
      const messageDiv = document.createElement('div');
      messageDiv.className = `chat-message ${msg.isOwn ? 'own' : ''} rounded-3 p-3 mb-2 private-chat-message new`;
      messageDiv.innerHTML = `
        <div class="d-flex justify-content-between mb-1">
          <strong class="${msg.isOwn ? 'text-primary' : 'text-dark'}">${msg.sender}</strong>
          <small class="text-muted">${msg.timestamp}</small>
        </div>
        <div>${msg.message}</div>
      `;

      container.appendChild(messageDiv);
    });

    // Сбрасываем счетчик непрочитанных сообщений для этого игрока
    this.unreadPrivateMessages[this.currentPrivateChat] = 0;

    // Прокручиваем вниз
    container.scrollTop = container.scrollHeight;
  }

  sendPrivateChatMessage() {
    if (!this.currentPrivateChat) return;

    const input = document.getElementById('privateChatInput');
    if (!input) return;

    const message = input.value.trim();

    if (message) {
      // Добавляем сообщение в приватный чат
      const timestamp = new Date().toLocaleTimeString();
      const chatMessage = {
        sender: this.playerName,
        message: message,
        timestamp: timestamp,
        isOwn: true
      };

      if (!this.privateChats[this.currentPrivateChat]) {
        this.privateChats[this.currentPrivateChat] = [];
      }

      this.privateChats[this.currentPrivateChat].push(chatMessage);

      // Отправляем сообщение в приватный чат
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'privateChatMessage',
          targetPlayerId: this.currentPrivateChat,
          message: message
        }));
      }

      // Обновляем отображение
      this.renderPrivateChatMessages();

      input.value = '';
    }
  }
}

// Инициализация игры при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
  window.gameClient = new GameClient();

  // Инициализация переключателя темы
  initThemeToggle();
});

// Функция инициализации переключателя темы
function initThemeToggle() {
  const themeToggleBtn = document.getElementById('themeToggle');
  const themeIcon = document.getElementById('themeIcon');
  const cardInner = document.querySelector('.card-inner-huge');

  // Проверяем сохранённое состояние темы
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-theme');
    themeIcon.className = 'fas fa-sun';
  } else {
    // Если тема не сохранена или светлая, устанавливаем иконку луны
    themeIcon.className = 'fas fa-moon';
  }

  themeToggleBtn.addEventListener('click', () => {
    // Анимация переворота карты при смене темы
    if (cardInner) {
      // Убираем класс перевернутой карты перед началом анимации
      cardInner.classList.remove('flipped');

      // Добавляем класс для анимации переворота
      cardInner.classList.add('theme-change-flip');

      // Определяем текущую тему до анимации
      const isCurrentlyDark = document.body.classList.contains('dark-theme');

      // Меняем тему в середине анимации (в момент, когда карта на 90 градусов)
      setTimeout(() => {
        // После завершения анимации переключаем тему и иконку
        if (isCurrentlyDark) {
          document.body.classList.remove('dark-theme');
          themeIcon.className = 'fas fa-moon';
          localStorage.setItem('theme', 'light');
        } else {
          document.body.classList.add('dark-theme');
          themeIcon.className = 'fas fa-sun';
          localStorage.setItem('theme', 'dark');
        }
      }, 350); // Меняем тему примерно в середине анимации (350мс из 700мс)

      // Добавляем класс перевернутой карты после завершения анимации
      setTimeout(() => {
        cardInner.classList.add('flipped'); // Добавляем класс перевернутой карты
        cardInner.classList.remove('theme-change-flip');
      }, 700); // Время должно совпадать с длительностью анимации в CSS
    } else {
      // Если анимация недоступна, просто переключаем тему
      document.body.classList.toggle('dark-theme');

      if (document.body.classList.contains('dark-theme')) {
        themeIcon.className = 'fas fa-sun';
        localStorage.setItem('theme', 'dark');
      } else {
        themeIcon.className = 'fas fa-moon';
        localStorage.setItem('theme', 'light');
      }
    }
  });
}
