import { Capacitor } from '@capacitor/core'

export async function prepareNative() {
  if (!Capacitor.isNativePlatform()) return
  const [{ StatusBar, Style }, { App }] = await Promise.all([import('@capacitor/status-bar'), import('@capacitor/app')])
  await StatusBar.setStyle({ style: Style.Dark })
  await StatusBar.setBackgroundColor({ color: '#05070d' })
  await StatusBar.setOverlaysWebView({ overlay: false })
  await App.addListener('backButton', () => {
    if (location.hash && location.hash !== '#/' && history.length > 1) history.back()
    else void App.exitApp()
  })
}
