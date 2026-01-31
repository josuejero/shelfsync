const clamp = (value: number, min: number, max: number) =>
	Math.min(Math.max(value, min), max);

export const parseLimitParam = (value?: string | null) => {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		return 50;
	}
	return clamp(Math.floor(parsed), 1, 200);
};

export const parseOffsetParam = (value?: string | null) => {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		return 0;
	}
	return Math.max(Math.floor(parsed), 0);
};

export const parseSortParam = (value?: string | null) => {
	if (value === "title" || value === "read_next" || value === "updated") {
		return value;
	}
	return "read_next";
};

export const parseBooleanQuery = (value?: string | null) =>
	value === "1" || value === "true" || value === "True";
