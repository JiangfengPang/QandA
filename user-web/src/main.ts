import { createApp } from 'vue';
import { createPinia } from 'pinia';
import {
  Button,
  CellGroup,
  Dialog,
  Field,
  Form,
  Loading
} from 'vant';
import 'vant/lib/index.css';
import App from './App.vue';
import router from './router';
import { startVersionUpdateChecker } from './utils/versionUpdate';
import './styles/index.css';
import './styles/typography.css';

const app = createApp(App);

app
  .use(createPinia())
  .use(router)
  .use(Button)
  .use(CellGroup)
  .use(Dialog)
  .use(Field)
  .use(Form)
  .use(Loading)
  .mount('#app');

startVersionUpdateChecker(router);
