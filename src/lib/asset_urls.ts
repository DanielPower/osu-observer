import { env } from '$env/dynamic/public';

export const modAssetNames = {
	HD: 'selection-mod-hidden.png',
	HR: 'selection-mod-hardrock.png',
	DT: 'selection-mod-doubletime.png',
	FL: 'selection-mod-flashlight.png',
	EZ: 'selection-mod-easy.png',
	NF: 'selection-mod-nofail.png',
	HT: 'selection-mod-halftime.png',
	SD: 'selection-mod-suddendeath.png',
	PF: 'selection-mod-perfect.png',
	SO: 'selection-mod-spunout.png',
	NC: 'selection-mod-doubletime.png' // NC uses the same icon as DT
};

export const getSkinAsset = (filename: string) =>
	env.PUBLIC_SERVE_MEDIA_PATH + '/skins/xootynator/' + filename;
