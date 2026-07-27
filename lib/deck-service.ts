import { db } from '../db';
import { decks } from '../db/schema';
import * as crypto from 'expo-crypto';

export async function getDefaultDeckId(): Promise<string> {
  const allDecks = await db.select().from(decks).limit(1);
  if (allDecks.length > 0) {
    return allDecks[0].id;
  }
  
  const id = crypto.randomUUID();
  await db.insert(decks).values({
    id,
    name: 'Mi Vocabulario',
    languageCode: 'zh-CN',
    createdAt: new Date(),
  });
  return id;
}

export async function getDecks() {
  return await db.select().from(decks);
}
