import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.cuentas.libro',
  appName: 'Cuentas',
  webDir: 'dist',
  android: {
    backgroundColor: '#05070d',
  },
  server: {
    androidScheme: 'https',
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
}

export default config
