import 'vue3-toastify/dist/index.css'
import { toast, type ToastContainerOptions } from 'vue3-toastify'

export default {
  autoClose: 1500,
  clearOnUrlChange: false,
  containerId: toast.POSITION.BOTTOM_RIGHT,
  limit: 5,
  pauseOnFocusLoss: false, // otherwise toasts never time out while the tab is in the background
  position: toast.POSITION.BOTTOM_RIGHT,
  theme: toast.THEME.COLORED,
} as ToastContainerOptions
