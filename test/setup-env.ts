import * as dotenv from 'dotenv';
import { join } from 'path';

// Roda antes de qualquer import da aplicação: aponta tudo para o banco de teste.
dotenv.config({ path: join(__dirname, '..', '.env.test') });
