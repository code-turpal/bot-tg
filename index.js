const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const token = '6854368286:AAHdZ7q9PZLIxUKJdaOivpN_zlAC8A40fsk';
const bot = new TelegramBot(token, {
    polling: true
});
bot.on('polling_error', (error) => {
    console.log(error); // Выводим ошибку в консоль для дальнейшего анализа
})
const db = new sqlite3.Database('database.db');
let currentTimerId;
db.serialize(function() {
    db.run("CREATE TABLE IF NOT EXISTS users (userId INTEGER PRIMARY KEY, userName TEXT, lastName TEXT, phoneNumber INTEGER, valueOrders INTEGER, carrierOrders INTEGER, customerOrders INTEGER)");
    console.log("Table 'users' created successfully");
    db.run("CREATE TABLE IF NOT EXISTS orders (orderId INTEGER, userId INTEGER, role TEXT, origin TEXT, destination TEXT, date TEXT, dateFormation INTEGER PRIMARY KEY, datems INTEGER)");
    console.log("Table 'orders' created successfully");
    db.run("CREATE TABLE IF NOT EXISTS historyOrders (orderId INTEGER, userId INTEGER, role TEXT, origin TEXT, destination TEXT, date TEXT, dateFormation INTEGER PRIMARY KEY, dateDeletion TEXT)");
    console.log("Table 'historyOrders' created successfully");
});
const userStates = new Map();
// Обработчик события 'message' для сообщений с контактной информацией
bot.on('message', (msg) => {
    if (msg.contact) {
        const chatId = msg.chat.id;
        const phoneNumber = msg.contact.phone_number;
        const userId = msg.contact.user_id;
        const firstname = msg.contact.first_name;
        const lastName = msg.contact.last_name;
        const valueOrders = 0;
        const carrierOrders = 0;
        const customerOrders = 0;
        db.get('SELECT * FROM users WHERE userId = ?', [userId], (err, row) => {
            if (err) {
                console.error(err);
                return;
            }
            if (!row) {
                db.run('INSERT INTO users (userId, userName, lastName, phoneNumber, valueOrders, carrierOrders, customerOrders) VALUES (?, ?, ?, ?, ?, ?, ?)', [userId, firstname, lastName, phoneNumber, valueOrders, carrierOrders, customerOrders], (err) => {
                    if (err) {
                        console.error(err);
                        return;
                    }
                    console.log('Информация о пользователе сохранена в базе данных');
                    showButtons(chatId, `Отлично, ${firstname}!`);
                });
            } else {
                showButtons(chatId, 'Вы уже предоставили свой контактный номер.');
            }
        });
    }
});
// Обработчик команды '/start'
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    userStates.set(chatId, {
        step: 0,
        order: {}
    });
    db.get('SELECT * FROM users WHERE userId = ?', [chatId], (err, row) => {
        if (err) {
            console.error(err);
            return;
        }
        if (!row) {
            bot.sendMessage(chatId, 'Добро пожаловать!\nТуда-Сюда Bot \u{1F69A} представляет собой удобный инструмент грузоперевозок. Будет полезен:\n- водителям в поиске клиентов (догруза)\n- людям, ищущим водителя для доставки груза (посылки)\nДля корректной работы необходимо поделится номером контактного телефона \u{2B07}\u{2B07}\u{2B07}', {
                reply_markup: {
                    keyboard: [
                        [{
                            text: 'Поделится',
                            request_contact: true
                        }]
                    ],
                    resize_keyboard: true
                }
            });
            return;
        } else {
            // Если пользователь уже существует в базе данных
            showButtons(chatId, `С возвращением, ${msg.from.first_name}!`);
        }
    });
})
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    let userState = userStates.get(chatId);
    if (!userState) {
        userState = {
            step: 0,
            order: {}
        };
        userStates.set(chatId, userState);
    }
    const message = msg.text;
    if (userState.step === 0) {
        if (message === 'Сделать заказ') {
            userState.step = 1;
            bot.sendMessage(chatId, 'Выберите роль "Перевозчик" или "Заказчик" с помощью кнопок ниже.', {
                reply_markup: {
                    keyboard: [
                        ["Перевозчик \u{1F69A}"],
                        ["Заказчик \u{1F64B}"]
                    ],
                    resize_keyboard: true
                }
            });
        }
    } else if (userState.step === 1) {
        if (message === 'Перевозчик \u{1F69A}' || message === 'Заказчик \u{1F64B}') {
            userState.order.userId = chatId;
            userState.order.role = message;
            userState.order.dateFormation = new Date().getTime();
            userState.step = 2;
            bot.sendMessage(chatId, "Введите откуда (пункт А)", {
                reply_markup: {
                    remove_keyboard: true
                }
            });
        }
    } else if (userState.step === 2) {
        userState.order.origin = message;
        userState.step = 3;
        bot.sendMessage(chatId, "Введите куда (пункт Б)");
    } else if (userState.step === 3) {
        userState.order.destination = message;
        userState.step = 4;
        if (userState.order.role === 'Перевозчик \u{1F69A}') {
            bot.sendMessage(chatId, "Введите дату выезда (в формате ДД.ММ.ГГГГ)");
        } else {
            confirmOrder(chatId, userState.order);
            userState.step = 5;
        }
    } else if (userState.step === 4 && userState.order.role === 'Перевозчик \u{1F69A}') {
        let processingDate = true;
        processDateInput(message);

        function processDateInput(message) {
            if (processingDate) {
                if (exitValidation(message)) {
                    userState.order.date = message;
                    userState.order.datems = (new Date(message.split(".").reverse().join("-"))).getTime() + 80000000;
                    userState.step = 5;
                    confirmOrder(chatId, userState.order);
                    processingDate = false;
                } else {
                    bot.sendMessage(chatId, `Дата введена некорректно, введите заново!`);
                }
            }
        }
    } else if (userState.step === 5) {
        if (message === "Отмена") {
            showButtons(chatId, "Заказ отменен \u{274C}");
        } else if (message === "Опубликовать") {
            saveOrder(userState.order);
            firstOdering(chatId, userState.order.role)
            counterIncrease(chatId, userState.order.role);
            showButtons(chatId, "Заказ размещен \u{2705}");
            checkMatchingOrders(userState.order, chatId);
        }
        userStates.delete(chatId);
    }
    if (userState.step === 0 && message === 'Активные') {
        db.all('SELECT * FROM orders WHERE userId = ?', [chatId], (err, rows) => {
            if (err) {
                console.error(err);
                bot.sendMessage(chatId, 'Произошла ошибка при получении активных заказов');
                return;
            }
            if (rows.length > 0) {
                rows.forEach((row) => {
                    let orderInfo;
                    if (row.date) {
                        orderInfo = `Номер заказа: ${row.orderId}\nДата создания: ${formatDateToDDMMYYYY(row.dateFormation)}\nРоль: ${row.role}\nОткуда: ${row.origin}\nКуда: ${row.destination}\nДата выезда: ${row.date}`;
                    } else {
                        orderInfo = `Номер заказа: ${row.orderId}\nДата создания: ${formatDateToDDMMYYYY(row.dateFormation)}\nРоль: ${row.role}\nОткуда: ${row.origin}\nКуда: ${row.destination}`;
                    };
                    let deleteButton = {
                        text: 'Удалить',
                        callback_data: `delete_order_${row.orderId}`
                    };
                    let previouslyFound = {
                        text: 'Показать ранее найденные',
                        callback_data: `previously_аound_${row.orderId}`
                    };
                    if (row.role === "Заказчик \u{1F64B}") {
                        bot.sendMessage(chatId, orderInfo, {
                            reply_markup: {
                                inline_keyboard: [
                                    [previouslyFound],
                                    [deleteButton]
                                ]
                            }
                        });
                    } else {
                        bot.sendMessage(chatId, orderInfo, {
                            reply_markup: {
                                inline_keyboard: [
                                    [deleteButton]
                                ]
                            }
                        });
                    }
                });
            } else {
                bot.sendMessage(chatId, 'У вас нет активных заказов');
            }
        });
    }
    if (userState.step === 0 && message === 'История заказов') {
        db.all('SELECT * FROM historyOrders WHERE userId = ?', [chatId], (err, rows) => {
            if (err) {
                console.error(err);
                bot.sendMessage(chatId, 'Произошла ошибка при получении истории заказов');
                return;
            }
            if (rows.length > 0) {
                let ordersCount = rows.length;
                rows.forEach((row, index) => {
                    let orderInfo;
                    if (row.date) {
                        orderInfo = `Номер заказа: ${row.orderId}\nДата создания: ${formatDateToDDMMYYYY(row.dateFormation)}\nДата удаления: ${row.dateDeletion}\nРоль: ${row.role}\nОткуда: ${row.origin}\nКуда: ${row.destination}\nДата выезда: ${row.date}`;
                    } else {
                        orderInfo = `Номер заказа: ${row.orderId}\nДата создания: ${formatDateToDDMMYYYY(row.dateFormation)}\nДата удаления: ${row.dateDeletion}\nРоль: ${row.role}\nОткуда: ${row.origin}\nКуда: ${row.destination}`;
                    }
                    // Отправка информации о заказе
                    bot.sendMessage(chatId, orderInfo).then(() => {
                        // Проверяем, является ли текущий заказ последним
                        if (index === ordersCount - 1) {
                            let deleteButton = {
                                text: 'Очистить',
                                callback_data: `delete_all_orders_${rows[0].userId}`
                            };
                            // Отправка сообщения с предложением очистить историю заказов
                            bot.sendMessage(chatId, 'Очистить историю заказов?', {
                                reply_markup: {
                                    inline_keyboard: [
                                        [deleteButton]
                                    ]
                                }
                            });
                        }
                    });
                });
            } else {
                bot.sendMessage(chatId, 'У вас нет истории заказов');
            }
        });
    }
    if (message === '/profile') {
        db.all('SELECT * FROM users WHERE userId = ?', [chatId], (err, users) => {
            if (err) {
                console.error(err);
                bot.sendMessage(chatId, 'Произошла ошибка при получении данных профиля');
                return;
                0
            }
            if (users.length > 0) {
                bot.sendMessage(chatId, `Ваш ID пользователя: ${chatId}\nСформировано заказов за все время: ${users[0].valueOrders}\n из них:\n -в роли "Перевозчик": ${users[0].carrierOrders}\n -в роли "Перевозчик": ${users[0].customerOrders}`)
            }
        })
    }
    if (userState.step === 0 && message === '\u{1F6A8} Админка \u{1F6A8}' && (chatId === 826855928 || chatId === 1025042420)) {
        bot.sendMessage(chatId, 'Вы вошли в административную панель', {
            reply_markup: {
                keyboard: [
                    ["Пользователи \u{1F468}", "Заказы \u{1F4CB}"],
                    ["Отправить сообщение в чат бота \u{1F4E2}"],
                    ["Назад \u{23EA}", "Статистика \u{1F4C9}"],
                ],
                resize_keyboard: true
            }
        });
    }
    if (userState.step === 0 && message === "Пользователи \u{1F468}" && (chatId === 826855928 || chatId === 1025042420)) {
        db.all('SELECT * FROM users', (err, rows) => {
            if (err) {
                console.error(err);
                bot.sendMessage(chatId, 'Произошла ошибка при получении данных пользователя');
                return;
            }
            if (rows.length > 0) {
                rows.forEach((user) => {
                    bot.sendMessage(chatId, `ID пользователя: ${user.userId}\nFirst name пользователя: ${user.userName}\nLast name пользователя: ${user.lastName}\nНомер телефона: +${user.phoneNumber}\nСоздал всего заказов: ${user.valueOrders}\n из них:\n - в роли "Перевозчик": ${user.carrierOrders}\n - в роли "Заказчик": ${user.customerOrders}`);
                });
            } else {
                bot.sendMessage(chatId, 'Нет пользователей в системе');
            }
        });
    } else if (userState.step === 0 && message === "Заказы \u{1F4CB}" && (chatId === 826855928 || chatId === 1025042420)) {
        db.all('SELECT * FROM orders', (err, rows) => {
            if (err) {
                console.error(err);
                bot.sendMessage(chatId, 'Произошла ошибка при получении заказов на староне админа');
                return;
            }
            if (rows.length > 0) {
                rows.forEach((order) => {
                    db.all('SELECT * FROM users WHERE userId = ?', [order.userId], (err, rows) => {
                        if (err) {
                            console.error(err);
                            bot.sendMessage(chatId, 'Произошла ошибка при получении user данных');
                            return;
                        }
                        if (rows.length > 0) {
                            let orderInfo;
                            if (order.date) {
                                orderInfo = `Номер заказа: ${order.orderId}\nFirst name пользователя: ${rows[0].userName}\nLast name пользователя: ${rows[0].lastName}\nНомер телефона: +${rows[0].phoneNumber}\nДата создания: ${formatDateToDDMMYYYY(order.dateFormation)}\nРоль: ${order.role}\nОткуда: ${order.origin}\nКуда: ${order.destination}\nДата выезда: ${order.date}`;
                            } else {
                                orderInfo = `Номер заказа: ${order.orderId}\nFirst name пользователя: ${rows[0].userName}\nLast name пользователя: ${rows[0].lastName}\nНомер телефона: +${rows[0].phoneNumber}\nДата создания: ${formatDateToDDMMYYYY(order.dateFormation)}\nРоль: ${order.role}\nОткуда: ${order.origin}\nКуда: ${order.destination}`;
                            };
                            let deleteButton = {
                                text: 'Удалить',
                                callback_data: `delete_order_${order.orderId}`
                            };
                            bot.sendMessage(chatId, orderInfo, {
                                reply_markup: {
                                    inline_keyboard: [
                                        [deleteButton]
                                    ]
                                }
                            });
                        }
                    })
                });
            } else {
                bot.sendMessage(chatId, 'Нет заказов в системе');
            }
        })
    } else if (userState.step === 0 && message === "Статистика \u{1F4C9}" && (chatId === 826855928 || chatId === 1025042420)) {
        let allUsers;
        let activeOrders;
        let allOrders;
        let allСarrierOrders;
        let allCustomerOrders;
        db.all('SELECT * FROM users', (err, rows) => {
            if (err) {
                console.error(err);
                bot.sendMessage(chatId, 'Произошла ошибка при получении данных пользователя');
                return;
            }
            if (rows.length > 0) {
                allUsers = rows.length;
                rows.forEach((user) => {
                    allOrders = +user.valueOrders;
                    allСarrierOrders = +user.carrierOrders;
                    allCustomerOrders = +user.customerOrders;
                })
                db.all('SELECT * FROM orders', (err, rows) => {
                    if (err) {
                        console.error(err);
                        bot.sendMessage(chatId, 'Произошла ошибка при получении активных заказов');
                        return;
                    }
                    if (rows.length > 0) {
                        activeOrders = rows.length;
                        bot.sendMessage(chatId, `Всего пользователей: ${allUsers}\nВсего активных заказов: ${activeOrders}\nЗаказов за все время: ${allOrders}\n из них:\n -заказов в роли "Перевозчик": ${allСarrierOrders}\n -заказов в роли "Заказчика": ${allCustomerOrders}`);
                    } else {
                        bot.sendMessage(chatId, `Всего пользователей: ${allUsers}\nВсего активных заказов: 0\nЗаказов за все время: ${allOrders}\n из них:\n -заказов в роли "Перевозчик": ${allСarrierOrders}\n -заказов в роли "Заказчика": ${allCustomerOrders}`);
                    }
                })
            }
        })
    }
    // else if (userState.step === 0 && message === "Отправить сообщение в чат бота \u{1F4E2}" && (chatId === 826855928 || chatId === 1025042420)) {
    // 	bot.sendMessage(chatId, 'Введите сообщение для отправки всем пользователям бота');
    // 	db.all('SELECT * FROM users', (err, rows) => {
    // 	  if (err) {
    // 		console.error(err);
    // 		bot.sendMessage(chatId, 'Произошла ошибка при получении данных пользователя');
    // 		return;
    // 	  }
    // 	  if (rows.length > 0) {
    // 		rows.forEach((user) => {
    // 		  if (user.userId) {
    // 				bot.sendMessage(user.userId, message);
    // 		  } else {
    // 			console.log('Некорректный chatId. Пользователь не получит сообщение.');
    // 		  }
    // 		});
    // 	  }
    // 	});
    //   } 
    else if (userState.step === 0 && message === "Назад \u{23EA}") {
        showButtons(chatId, `Вы вернулись в главное меню`);
    }
});
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    if (data.startsWith('delete_order_')) {
        const orderId = data.replace('delete_order_', ''); // получаем ID заказа из callback_data
        logicDeletingOrders(chatId, orderId);
    } else if (data.startsWith('delete_all_orders_')) {
        const userId = data.replace('delete_all_orders_', ''); // получаем ID пользователя из callback_data
        removingHistoryOrders(chatId, userId);
    } else if (data.startsWith('delete_timer_')) {
        const timerId = data.replace('delete_timer_', '');
        clearTimeout(timerId);
        console.log('Таймер удален');
    } else if (data.startsWith('previously_аound_')) {
        const orderId = data.replace('previously_аound_', '');
        pullingOutOrderObject(chatId, orderId);
    }
});

function showButtons(id, msgText) {
    if (id === 826855928) {
        bot.sendMessage(id, msgText, {
            reply_markup: {
                keyboard: [
                    ["Сделать заказ"],
                    ["Активные"],
                    ["История заказов"],
                    ["\u{1F6A8} Админка \u{1F6A8}"]
                ],
                resize_keyboard: true
            }
        })
    } else {
        bot.sendMessage(id, msgText, {
            reply_markup: {
                keyboard: [
                    ["Сделать заказ"],
                    ["Активные"],
                    ["История заказов"]
                ],
                resize_keyboard: true
            }
        })
    }
}

function saveOrder(order) {
    getRandomNumber().then(uniqueNumber => {
        console.log("Уникальный номер:", uniqueNumber);
        db.run('INSERT INTO orders (orderId, userId, role, origin, destination, date, dateFormation, datems) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [uniqueNumber, order.userId, order.role, order.origin, order.destination, order.date, order.dateFormation, order.datems]);
    }).catch(error => {
        console.error("Произошла ошибка:", error);
    });
}
// РЕШИТЬ ПРОБЛЕМУ
function checkMatchingOrders(order, chatId) {
    db.all('SELECT * FROM orders WHERE role != ? AND userId != ? AND origin = ? AND destination = ?', [order.role, order.userId, order.origin, order.destination], (err, rows) => {
        if (err) {
            console.error('Ошибка при выполнении запроса SELECT к таблице orders:', err);
            return;
        }
        if (rows.length > 0) {
            rows.forEach((matchingOrder, index, arr) => {
                if (order.role === 'Перевозчик \u{1F69A}') {
                    db.get('SELECT * FROM users WHERE userId = ?', [chatId], (err, user) => {
                        if (err) {
                            console.error('Ошибка при выполнении запроса SELECT к таблице users:', err);
                            return;
                        }
                        if (user) {
                            const message = `Найден подходящий перевозчик, ${user.userName}\nОн выезжает: из ${order.origin} в ${order.destination}\nДата выезда: ${order.date}\nНомер телефона: +${user.phoneNumber}`;
                            bot.sendMessage(matchingOrder.userId, message);
                            if (index === arr.length - 1) {
                                if (currentTimerId) {
                                    clearTimeout(currentTimerId);
                                }
                                currentTimerId = setTimeout(sendingDeletionMessage, 10800000, chatId, matchingOrder.orderId);
                            }
                        }
                    });
                } else {
                    db.get('SELECT * FROM users WHERE userId = ?', [matchingOrder.userId], (err, user) => {
                        if (err) {
                            console.error('Ошибка при выполнении запроса SELECT к таблице users:', err);
                            return;
                        }
                        if (user) {
                            const message = `Найден подходящий перевозчик, ${user.userName}\nОн выезжает: из ${order.origin} в ${order.destination}\nДата выезда: ${matchingOrder.date}\nНомер телефона: +${user.phoneNumber}`;
                            bot.sendMessage(chatId, message);
                            db.get('SELECT * FROM orders WHERE userId = ? AND origin = ? AND destination = ?', [order.userId, order.origin, order.destination], (err, rows) => {
                                if (err) {
                                    console.error('Ошибка при выполнении запроса SELECT к таблице users:', err);
                                    return;
                                }
                                if (rows) {
                                    if (index === arr.length - 1) {
                                        if (currentTimerId) {
                                            clearTimeout(currentTimerId);
                                        }
                                        currentTimerId = setTimeout(sendingDeletionMessage, 10800000, chatId, rows.orderId);
                                    }
                                }
                            });
                        }
                    });
                }
            })
        }
    });
}

function removingOrder(id, chatId) {
    let db = new sqlite3.Database('database.db');
    db.run('DELETE FROM orders WHERE orderId = ?', [id], (err) => {
        if (err) {
            console.error(err);
            // обработка ошибки удаления
        } else {
            bot.sendMessage(chatId, 'Заказ успешно удален');
            // дополнительные действия в случае успешного удаления
        }
    });
    db.close();
}

function removingHistoryOrders(chatId, userId) {
    let db = new sqlite3.Database('database.db');
    db.run('DELETE FROM historyOrders WHERE userId = ?', [userId], (err) => {
        if (err) {
            console.error(err);
            // обработка ошибки удаления
        } else {
            bot.sendMessage(chatId, 'История заказов успешно удалена');
            // дополнительные действия в случае успешного удаления
        }
    });
    db.close();
}
// Функция для регулярной проверки и удаления истекших заказов
function checkExpiredOrders() {
    const currentTime = Date.now(); // Получаем текущее время в миллисекундах
    db.all('SELECT * FROM orders WHERE datems < ?', [currentTime], (err, rows) => {
        if (err) {
            console.error(err);
            return;
        }
        rows.forEach((row) => {
            logicDeletingOrders(row.userId, row.orderId);
        });
    });
}

function confirmOrder(chatId, order) {
    let orderInfo;
    if (order.role === "Перевозчик \u{1F69A}") {
        orderInfo = `Подтвердите заказ:\nРоль: ${order.role}\nОткуда: ${order.origin}\nКуда: ${order.destination}\nДата: ${order.date}`;
    } else if (order.role === "Заказчик \u{1F64B}") {
        orderInfo = `Подтвердите заказ:\nРоль: ${order.role}\nОткуда: ${order.origin}\nКуда: ${order.destination}`;
    }
    bot.sendMessage(chatId, orderInfo, {
        reply_markup: {
            keyboard: [
                ["Опубликовать"],
                ["Отмена"]
            ],
            resize_keyboard: true
        }
    });
}

function getRandomNumber() {
    return new Promise((resolve, reject) => {
        const randomNumber = Math.floor(1000 + Math.random() * 9000);
        db.get('SELECT * FROM orders WHERE orderId = ?', [randomNumber], (err, row) => {
            if (err) {
                console.error(err);
                reject(err);
            }
            if (!row) {
                db.get('SELECT * FROM historyOrders WHERE orderId = ?', [randomNumber], (err, historyRow) => {
                    if (err) {
                        console.error(err);
                        reject(err);
                    }
                    if (!historyRow) {
                        resolve(randomNumber);
                    } else {
                        resolve(getRandomNumber());
                    }
                });
            } else {
                resolve(getRandomNumber());
            }
        });
    });
}

function formatDate(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Месяцы считаются с 0, поэтому добавляем 1
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
}
// Регулярная проверка и удаление истекших заказов, например, каждую минуту
setInterval(checkExpiredOrders, 60000); // 9000000 миллисекунд = 2 часа
function logicDeletingOrders(chatId, orderId) {
    db.serialize(() => {
        db.get('SELECT * FROM orders WHERE orderId = ?', [orderId], (err, row) => {
            if (err) {
                console.error(err.message);
            } else {
                if (row) {
                    let currentDate = new Date();
                    let dateDeletion = formatDate(currentDate);
                    db.run('INSERT INTO historyOrders (orderId, userId, role, origin, destination, date, dateFormation, dateDeletion) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [orderId, row.userId, row.role, row.origin, row.destination, row.date, row.dateFormation, dateDeletion], function(err) {
                        if (err) {
                            console.error(err.message);
                        } else {
                            console.log(`Строка с orderId ${orderId} успешно перенесена в другую таблицу`);
                            removingOrder(orderId, chatId);
                        }
                    });
                } else {
                    console.log(`Строка с orderId ${orderId} не найдена`);
                    return;
                }
            }
        });
    });
}

function sendingDeletionMessage(chatId, orderId) {
    currentTimerId = false;
    db.all('SELECT * FROM orders WHERE orderId = ? AND userId = ?', [orderId, chatId], (err, order) => {
        if (err) {
            console.error('Ошибка при выполнении запроса SELECT к таблице orders:', err);
            return;
        }
        if (order && order.length > 0) {
            let timerId = setTimeout(logicDeletingOrders, 18000000, chatId, orderId);
            let deleteCompletedOrder = {
                text: 'Удалить заказ',
                callback_data: `delete_order_${orderId}`
            };
            let continueSearching = {
                    text: 'Продолжить поиск',
                    callback_data: `delete_timer_${timerId}`
                }
                // Отправка сообщения с предложением очистить историю заказов
            bot.sendMessage(chatId, '\u{2757}\nНашли ли вы "Перевозчика" среди ранее найденных вариантов? Если результат поиска удовлетворил вас, рекомендуем удалить заказ. Если желаете продолжить поиск, нажмите кнопку "Продолжить поиск". В случае игнорирования данного сообщения, заказ будет автоматически удален через 5 часов.', {
                reply_markup: {
                    inline_keyboard: [
                        [deleteCompletedOrder],
                        [continueSearching]
                    ]
                }
            });
        }
    })
}

function pullingOutOrderObject(chatId, orderId) {
    db.all('SELECT * FROM orders WHERE orderId = ? AND userId = ?', [orderId, chatId], (err, order) => {
        if (err) {
            console.error('Ошибка при выполнении запроса SELECT к таблице orders:', err);
            return;
        }
        if (order && order.length > 0) {
            checkMatchingOrders(order[0], chatId);
        }
    });
}

function exitValidation(message) {
    if (message.length === 10 && message[2] === '.' && message[5] === '.') {
        let datems = (new Date(message.split(".").reverse().join("-"))).getTime() + 80000000;
        const currentTime = Date.now();
        if (datems > currentTime) {
            return true;
        }
    }
}

function formatDateToDDMMYYYY(timestamp) {
    const date = new Date(timestamp); // Создание объекта Date из временной метки
    const day = String(date.getDate()).padStart(2, '0'); // Получение дня месяца с добавлением нуля спереди, если число меньше 10
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Получение месяца с добавлением нуля спереди, так как месяцы в JavaScript начинаются с 0
    const year = date.getFullYear(); // Получение года
    return `${day}.${month}.${year}`; // Возвращение даты в формате "дд.мм.гггг"
}

function counterIncrease(chatId, role) {
    db.all('SELECT * FROM users WHERE userId = ?', [chatId], (err, user) => {
        if (err) {
            console.error('Ошибка при выполнении запроса SELECT к таблице users:', err);
            return;
        }
        if (user.length > 0) {
            if (role === "Перевозчик \u{1F69A}") {
                db.run('UPDATE users SET valueOrders = ?, carrierOrders = ? WHERE userId = ?', [user[0].valueOrders + 1, user[0].carrierOrders + 1, chatId], (err) => {
                    if (err) {
                        console.error('Ошибка при выполнении запроса UPDATE к таблице users:', err);
                        return;
                    }
                })
            } else {
                db.run('UPDATE users SET valueOrders = ?, customerOrders = ? WHERE userId = ?', [user[0].valueOrders + 1, user[0].customerOrders + 1, chatId], (err) => {
                    if (err) {
                        console.error('Ошибка при выполнении запроса UPDATE к таблице users:', err);
                        return;
                    }
                })
            }
        }
    })
}

function firstOdering(chatId, role) {
    db.all('SELECT * FROM users WHERE userId = ?', [chatId], (err, user) => {
        if (err) {
            console.error('Ошибка при выполнении запроса SELECT к таблице users:', err);
            return;
        }
        if (user.length > 0) {
            if (role === "Перевозчик \u{1F69A}" && user[0].carrierOrders < 1) {
                bot.sendMessage(chatId, `Отлично! \u{1F389}\u{1F389}\u{1F389}\nВы сформировали свой первый заказ в роли "Перевозчик". Ваш контактный телефон будет отправлен каждому пользователю с ролью "Заказчик", заинтересованному в вашем маршруте, для дальнейшей связи с вами.`);
            } else if (role === "Заказчик \u{1F64B}" && user[0].customerOrders < 1) {
                bot.sendMessage(chatId, `Отлично! \u{1F389}\u{1F389}\u{1F389}\nВы сформировали свой первый заказ в роли "Заказчик". Как только в системе появится интересующий вас маршрут, вам будут предложены все доступные варианты с контактной информацией водителей для дальнейшей связи.`);
            }
        }
    })
}