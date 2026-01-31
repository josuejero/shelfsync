const _ws = /\s+/g;
const _nonAlnum = /[^a-zA-Z0-9]+/g;

export const normalizePreferredFormats = (formats?: string[]) => {
	const allowedSet = new Set<string>();
	for (const raw of formats ?? []) {
		const normalized = raw.trim().toLowerCase();
		if (normalized) {
			allowedSet.add(normalized);
		}
	}

	const ordered: string[] = [];
	for (const fmt of ["ebook", "audiobook"]) {
		if (allowedSet.has(fmt)) {
			ordered.push(fmt);
		}
	}

	return ordered;
};

export const parsePreferredFormatsValue = (value: string | null) => {
	if (!value) {
		return [];
	}

	try {
		const parsed = JSON.parse(value);
		if (Array.isArray(parsed)) {
			return parsed.filter((item) => typeof item === "string");
		}
	} catch {
		// fall back to empty
	}

	return [];
};

export const normalizeText = (value: string) => {
	let text = (value || "").trim().toLowerCase();
	text = text.replace(_nonAlnum, " ");
	text = text.replace(_ws, " ").trim();
	return text;
};

export const normalizeIsbn = (value: string | null | undefined) => {
	if (!value) {
		return null;
	}
	const digits = value.replace(/[^0-9xX]/g, "");
	return digits ? digits.toUpperCase() : null;
};
