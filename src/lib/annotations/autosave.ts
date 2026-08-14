const STORAGE_KEY = 'iiif-map-viewer:editor-autosave';

export function saveAnnotationsDraft(annotations: unknown): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(annotations));
	} catch (error) {
		console.warn('localStorageへの自動保存に失敗しました。', error);
	}
}

export function loadAnnotationsDraft(): unknown | undefined {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? JSON.parse(raw) : undefined;
	} catch (error) {
		console.warn('localStorageからの復元に失敗しました。', error);
		return undefined;
	}
}

export function clearAnnotationsDraft(): void {
	localStorage.removeItem(STORAGE_KEY);
}
