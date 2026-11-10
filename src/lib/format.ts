export function fileSize(bytes: number) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function timeAgo(iso: string) {
	const s = (Date.now() - new Date(iso).getTime()) / 1000;
	if (s < 60) return 'just now';
	if (s < 3600) return `${Math.floor(s / 60)} min ago`;
	if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
	if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
	return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** Whole days from `today` to `due` (both YYYY-MM-DD). Negative = overdue. */
export function daysUntil(due: string, today: string) {
	return Math.round((Date.parse(due) - Date.parse(today)) / 86400000);
}

export function countdown(days: number) {
	if (days === 0) return 'Today';
	if (days === 1) return 'Tomorrow';
	if (days === -1) return 'Yesterday';
	if (days < 0) return `${-days} days ago`;
	if (days < 14) return `In ${days} days`;
	return `In ${Math.round(days / 7)} weeks`;
}

export function urgency(days: number, done: boolean) {
	if (done) return 'done';
	if (days < 0) return 'overdue';
	if (days <= 3) return 'soon';
	if (days <= 10) return 'near';
	return 'later';
}

export function longDate(iso: string) {
	return new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', {
		weekday: 'short',
		day: 'numeric',
		month: 'short'
	});
}

export function fileKind(name: string) {
	const ext = name.split('.').pop()?.toLowerCase() ?? '';
	if (ext === 'pdf') return 'PDF';
	if (['ppt', 'pptx', 'key'].includes(ext)) return 'Slides';
	if (['doc', 'docx', 'pages', 'txt', 'rtf'].includes(ext)) return 'Doc';
	if (['xls', 'xlsx', 'csv', 'numbers'].includes(ext)) return 'Sheet';
	if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic'].includes(ext)) return 'Image';
	return ext.toUpperCase() || 'File';
}

export function stepDates(due: string, alt?: string) {
	return alt ? `${longDate(due)} or ${longDate(alt)}` : longDate(due);
}
