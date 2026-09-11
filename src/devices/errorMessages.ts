const messages: Record<string, string> = {
  nativeBuildRequired: "Для подключения браслета нужна dev-сборка AxMed на iPhone. В Expo Go поиск недоступен.",
  iosOnly: "Подключение браслета пока доступно только в iOS dev-сборке AxMed.",
  nativeUnavailable: "Не удалось запустить модуль Bluetooth. Перезапустите приложение и попробуйте снова.",
  bluetoothOff: "Включите Bluetooth в настройках iPhone и повторите поиск.",
  bluetoothUnavailable: "Bluetooth временно недоступен. Повторите поиск.",
  bluetoothUnsupported: "Bluetooth недоступен на этом устройстве.",
  permissionDenied: "Разрешите AxMed доступ к Bluetooth в настройках iPhone и повторите поиск.",
  deviceNotFound: "Браслет больше не доступен. Повторите поиск рядом с ним.",
  verificationFailed: "Браслет не подтвердил подключение. Возможно, у него другой пароль или несовместимый протокол.",
  connectionFailed: "Не удалось подключиться. Отключите браслет в G Band и повторите попытку.",
  connectionTimeout: "Браслет не ответил. Поднесите его ближе и отключите соединение в G Band.",
  confirmationTimeout: "Подтвердите подключение на браслете, если он показывает запрос, и попробуйте снова.",
  disconnected: "Соединение с браслетом потеряно. Попробуйте подключиться снова.",
  invalidNativeState: "SDK не подтвердил выбранное устройство. Повторите поиск."
};
export function deviceErrorMessage(code?: string) {
  return messages[code ?? ""] ?? "Не удалось подключить браслет. Попробуйте снова.";
}
