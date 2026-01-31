import type { AvailabilityEntry } from "../types";

const STATUS_WEIGHT: Record<string, number> = {
	available: 1000.0,
	hold: 500.0,
	not_owned: 0.0,
};

const sortCandidates = (
	candidates: {
		fmt: string;
		status: string;
		score: number;
		hold_ratio: number | null;
		copies_available: number | null;
		copies_total: number | null;
		holds: number | null;
		fmt_index: number;
	}[],
) => {
	candidates.sort((a, b) => {
		if (a.score === b.score) {
			return b.fmt_index - a.fmt_index;
		}
		return a.score - b.score;
	});
	return candidates[candidates.length - 1];
};

export const computeReadNext = (
	availability: AvailabilityEntry[] | null | undefined,
	preferredFormats: string[],
) => {
	const preferred = [...(preferredFormats || [])];
	const avail = [...(availability || [])];
	if (!avail.length) {
		return {
			score: STATUS_WEIGHT["not_owned"],
			tier: "not_owned",
			best_format: null,
			hold_ratio: null,
			reasons: [
				"No availability data (not owned or not checked yet)",
				"Tier: not_owned",
			],
		};
	}
	const candidates: {
		fmt: string;
		status: string;
		score: number;
		hold_ratio: number | null;
		copies_available: number | null;
		copies_total: number | null;
		holds: number | null;
		fmt_index: number;
	}[] = [];
	for (const entry of avail) {
		const fmt = entry.format;
		if (!fmt) {
			continue;
		}
		if (preferred.length && !preferred.includes(fmt)) {
			continue;
		}
		const status = entry.status ?? "not_owned";
		const copiesAvailable = entry.copies_available ?? null;
		const copiesTotal = entry.copies_total ?? null;
		const holds = entry.holds ?? null;
		const fmtIndex = preferred.indexOf(fmt);
		const fmtBonus = fmtIndex !== -1 ? 20.0 / (fmtIndex + 1) : 0.0;
		const base = STATUS_WEIGHT[status] ?? STATUS_WEIGHT["not_owned"];
		let copiesBonus = 0.0;
		if (status === "available" && copiesAvailable !== null) {
			copiesBonus = Math.min(Math.max(copiesAvailable, 0), 10);
		}
		let holdRatio: number | null = null;
		let holdPenalty = 0.0;
		if (status === "hold" && holds !== null) {
			if (copiesTotal !== null && copiesTotal > 0) {
				holdRatio = holds / Math.max(copiesTotal, 1);
				holdPenalty = Math.min(holdRatio * 25.0, 400.0);
			} else {
				holdPenalty = Math.min(holds * 2.0, 400.0);
			}
		}
		const score = base + fmtBonus + copiesBonus - holdPenalty;
		candidates.push({
			fmt,
			status,
			score,
			hold_ratio: holdRatio,
			copies_available: copiesAvailable,
			copies_total: copiesTotal,
			holds,
			fmt_index: fmtIndex !== -1 ? fmtIndex : 999,
		});
	}
	if (!candidates.length) {
		return {
			score: STATUS_WEIGHT["not_owned"],
			tier: "not_owned",
			best_format: null,
			hold_ratio: null,
			reasons: ["No preferred-format availability data", "Tier: not_owned"],
		};
	}
	const best = sortCandidates(candidates);
	const tier = best.status;
	const bestFormat = best.fmt;
	const reasons: string[] = [];
	if (tier === "available") {
		if (preferred.includes(bestFormat)) {
			reasons.push(
				`Available now in ${bestFormat} (preferred #${preferred.indexOf(bestFormat) + 1})`,
			);
		} else {
			reasons.push(`Available now in ${bestFormat}`);
		}
		if (best.copies_available !== null || best.copies_total !== null) {
			reasons.push(
				`Copies available: ${best.copies_available ?? 0} / ${best.copies_total ?? 0}`,
			);
		}
	} else if (tier === "hold") {
		if (preferred.includes(bestFormat)) {
			reasons.push(
				`On hold in ${bestFormat} (preferred #${preferred.indexOf(bestFormat) + 1})`,
			);
		} else {
			reasons.push(`On hold in ${bestFormat}`);
		}
		if (
			best.hold_ratio !== null &&
			best.holds !== null &&
			best.copies_total !== null
		) {
			reasons.push(
				`Hold queue: ${best.holds} holds / ${best.copies_total} copies (ratio ${best.hold_ratio.toFixed(
					2,
				)})`,
			);
		} else if (best.holds !== null) {
			reasons.push(`Hold queue: ${best.holds} holds`);
		} else {
			reasons.push("Hold queue length unavailable");
		}
	} else {
		reasons.push("Not owned in your selected library/catalog");
	}
	reasons.push(`Tier: ${tier}`);
	return {
		score: best.score,
		tier,
		best_format: bestFormat,
		hold_ratio: best.hold_ratio,
		reasons,
	};
};

export const sortAvailabilityEntries = (
	entries: AvailabilityEntry[],
	preferredFormats: string[],
) => {
	const copy = [...entries];
	const getIndex = (format: string | null) => {
		if (!format) {
			return 999;
		}
		const idx = preferredFormats.indexOf(format);
		return idx === -1 ? 999 : idx;
	};
	copy.sort((a, b) => {
		const idxA = getIndex(a.format);
		const idxB = getIndex(b.format);
		if (idxA !== idxB) {
			return idxA - idxB;
		}
		const afmt = a.format ?? "";
		const bfmt = b.format ?? "";
		return afmt.localeCompare(bfmt);
	});
	return copy;
};

export const toAvailabilityResponse = (entry: AvailabilityEntry) => ({
	format: entry.format,
	status: entry.status,
	copies_available: entry.copies_available,
	copies_total: entry.copies_total,
	holds: entry.holds,
	deep_link: entry.deep_link,
});
