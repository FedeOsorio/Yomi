// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import journal from './meta/_journal.json';
import m0000 from './0000_classy_sleeper.sql';
import m0001 from './0001_last_joshua_kane.sql';
import m0002 from './0002_bored_dazzler.sql';
import m0003 from './0003_nested_folders.sql';
import m0004 from './0004_young_cammi.sql';
import m0005 from './0005_anki_note_types.sql';
import m0006 from './0006_deck_answer_mode.sql';

  export default {
    journal,
    migrations: {
      m0000,
m0001,
m0002,
m0003,
m0004,
m0005,
m0006
    }
  }
  