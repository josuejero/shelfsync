import Papa from "papaparse";
import type { D1Database } from "@cloudflare/workers-types";
import type { GoodreadsCsvRow } from "../types";
import { normalizeText, normalizeIsbn } from "../utils/text";

export const parseGoodreadsCsv = (text: string) => {
	const sanitized = text.replace(/^\uFEFF/, "");
	const parsed = Papa.parse<Record<string, string>>(sanitized, {
		header: true,
		skipEmptyLines: true,
	});

	const fields = parsed.meta.fields ?? [];
	const required = ["Title", "Author"];
	if (!required.every((field) => fields.includes(field))) {
		throw new Error(
			"CSV missing Title/Author columns. Export from Goodreads → My Books → Import and Export → Export Library.",
		);
	}

	const rows: GoodreadsCsvRow[] = [];
	const errors: { line: number; error: string }[] = [];

	parsed.data.forEach((raw, index) => {
		const line = index + 2;
		const title = (raw["Title"] ?? "").trim();
		const author = (raw["Author"] ?? "").trim();
		if (!title || !author) {
			errors.push({ line, error: "Missing Title/Author" });
			return;
		}

		const externalId = (raw["Book Id"] ?? "").trim() || null;
		const shelf = (raw["Exclusive Shelf"] ?? "").trim() || null;

		rows.push({
			external_id: externalId,
			title,
			author,
			isbn10: normalizeIsbn(raw["ISBN"] ?? null),
			isbn13: normalizeIsbn(raw["ISBN13"] ?? null),
			asin: null,
			shelf,
		});
	});

	parsed.errors.forEach((err) => {
		const line = typeof err.row === "number" ? err.row + 2 : 0;
		errors.push({ line, error: err.message });
	});

	return { rows, errors };
};

export const upsertShelfItems = async (
	db: D1Database,
	userId: string,
	sourceId: string,
	items: GoodreadsCsvRow[],
) => {
	const summary = {
		created: 0,
		updated: 0,
		skipped: 0,
		errors: [] as { key: string; error: string }[],
	};

	for (const item of items) {
		try {
			const title = item.title.trim();
			const author = item.author.trim();
			if (!title || !author) {
				summary.skipped += 1;
				continue;
			}

			const normalizedTitle = normalizeText(title);
			const normalizedAuthor = normalizeText(author);
			const needsFuzzy = !item.isbn10 && !item.isbn13 && !item.asin;

			let targetId: string | null = null;
			if (item.external_id) {
				const existing = await db
					.prepare(
						"SELECT id FROM shelf_items WHERE shelf_source_id = ? AND external_id = ? AND user_id = ? LIMIT 1",
					)
					.bind(sourceId, item.external_id, userId)
					.first<{ id: string }>();
				if (existing) {
					targetId = existing.id;
				}
			}

			if (targetId) {
				await db
					.prepare(
						"UPDATE shelf_items SET title = ?, author = ?, isbn10 = ?, isbn13 = ?, asin = ?, normalized_title = ?, normalized_author = ?, shelf = ?, needs_fuzzy_match = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
					)
					.bind(
						title,
						author,
						item.isbn10,
						item.isbn13,
						item.asin,
						normalizedTitle,
						normalizedAuthor,
						item.shelf,
						needsFuzzy ? 1 : 0,
						targetId,
					)
					.run();
				summary.updated += 1;
			} else {
				await db
					.prepare(
						"INSERT INTO shelf_items (id, user_id, shelf_source_id, external_id, title, author, isbn10, isbn13, asin, normalized_title, normalized_author, shelf, needs_fuzzy_match) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
					)
					.bind(
						crypto.randomUUID(),
						userId,
						sourceId,
						item.external_id,
						title,
						author,
						item.isbn10,
						item.isbn13,
						item.asin,
						normalizedTitle,
						normalizedAuthor,
						item.shelf,
						needsFuzzy ? 1 : 0,
					)
					.run();
				summary.created += 1;
			}
		} catch (error) {
			summary.errors.push({
				key: item.external_id ?? `${item.title}:${item.author}`,
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	}

	return summary;
};
