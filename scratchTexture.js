(function () {
    'use strict';

    const scratchTextureCache = new Map();
    const MAX_SCRATCH_CACHE_ENTRIES = 48;

    function clampScratch(v) {
        return Math.max(0, Math.min(100, Number(v) || 0));
    }

    function hashSeed(text) {
        let h = 2166136261 >>> 0;
        for (let i = 0; i < text.length; i += 1) {
            h ^= text.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    function createSeededRandom(seedText) {
        let state = hashSeed(seedText) || 1;
        return function nextRandom() {
            state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
            return state / 4294967296;
        };
    }

    function randomIntWith(rand, min, max) {
        return Math.floor(rand() * (max - min + 1)) + min;
    }

    function pickScratchAngleWith(rand) {
        const roll = rand();
        if (roll < 0.55) return randomIntWith(rand, -18, 18);
        if (roll < 0.85) return randomIntWith(rand, -28, 28);
        return randomIntWith(rand, -40, 40);
    }

    function buildRandomScratchTexture(levelRaw, densityRaw, intensityRaw) {
        const level = clampScratch(levelRaw);
        const density = clampScratch(densityRaw);
        const intensity = clampScratch(intensityRaw);
        const key = `${level}|${density}|${intensity}`;

        if (scratchTextureCache.has(key)) {
            return scratchTextureCache.get(key);
        }

        if (level <= 0) {
            scratchTextureCache.set(key, 'none');
            return 'none';
        }

        const rand = createSeededRandom(`scratch|${key}`);
        const levelUnit = level / 100;
        const densityUnit = density / 100;
        const intensityUnit = intensity / 100;

        const totalScratchCount = Math.max(1, Math.round(levelUnit * (8 + densityUnit * 32)));

        let deepMin = 0;
        let deepMax = 0;
        if (intensityUnit > 0) {
            if (intensityUnit <= 0.5) {
                const t = intensityUnit / 0.5;
                deepMin = Math.round(t * 1);
                deepMax = Math.max(deepMin, Math.round(t * 2));
            } else {
                const t = (intensityUnit - 0.5) / 0.5;
                deepMin = Math.round(1 + t * 7);
                deepMax = Math.round(2 + t * 8);
            }
        }

        const deepScaleByLevel = Math.max(0, levelUnit);
        deepMin = Math.round(deepMin * deepScaleByLevel);
        deepMax = Math.round(deepMax * deepScaleByLevel);
        const deepCount = Math.min(totalScratchCount, deepMax > 0 ? randomIntWith(rand, deepMin, Math.max(deepMin, deepMax)) : 0);

        const layers = [];
        const lightAlpha = 0.04 + intensityUnit * 0.08;
        const deepAlpha = 0.14 + intensityUnit * 0.22;
        const clusterCount = Math.max(0, Math.round(totalScratchCount * 0.18));
        const clusterAnchors = Array.from({ length: clusterCount }, () => ({
            start: randomIntWith(rand, 8, 88),
            angle: pickScratchAngleWith(rand)
        }));

        for (let i = 0; i < totalScratchCount; i += 1) {
            const isDeep = i < deepCount;
            const useCluster = clusterAnchors.length > 0 && rand() < 0.55;
            const anchor = useCluster ? clusterAnchors[randomIntWith(rand, 0, clusterAnchors.length - 1)] : null;
            const angle = anchor ? Math.max(-40, Math.min(40, anchor.angle + randomIntWith(rand, -6, 6))) : pickScratchAngleWith(rand);
            const start = anchor ? Math.max(3, Math.min(95, anchor.start + randomIntWith(rand, -7, 7))) : randomIntWith(rand, 3, 95);
            const width = isDeep ? 2 : 1;
            const extraLength = isDeep ? randomIntWith(rand, 0, 2) : randomIntWith(rand, 0, 1);
            const end = Math.min(99, start + width + extraLength);
            const color = isDeep ? `rgba(0,0,0,${deepAlpha.toFixed(3)})` : `rgba(255,255,255,${lightAlpha.toFixed(3)})`;
            layers.push(`linear-gradient(${angle}deg, transparent ${start}%, ${color} ${start}%, ${color} ${end}%, transparent ${end}%)`);
        }

        const texture = layers.length > 0 ? layers.join(', ') : 'none';
        scratchTextureCache.set(key, texture);

        if (scratchTextureCache.size > MAX_SCRATCH_CACHE_ENTRIES) {
            const oldestKey = scratchTextureCache.keys().next().value;
            scratchTextureCache.delete(oldestKey);
        }

        return texture;
    }

    window.DashboardScratchTexture = {
        buildRandomScratchTexture
    };
})();
