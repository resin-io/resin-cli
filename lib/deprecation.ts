/**
 * @license
 * Copyright 2021 Balena Ltd.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

interface ReleaseTimestampsByVersion {
	[version: string]: string; // e.g. { '12.0.0': '2021-06-16T12:54:52.000Z' }
	lastChecked: string; // ISO 8601 timestamp, e.g. '2021-06-27T16:46:10.000Z'
}

export class DeprecationChecker {
	readonly majorVersionCheckIntervalDays = 7;
	readonly expiryDays = 365;
	readonly deprecationDays = this.expiryDays / 2;
	readonly msInDay = 24 * 60 * 60 * 1000; // milliseconds in a day
	readonly debugPrefix = 'Deprecation check';
	readonly cacheFile = 'cachedReleaseTimestamps';
	readonly now = new Date().getTime();
	private initialized = false;
	storage: ReturnType<typeof import('balena-settings-storage')>;
	cachedTimestamps: ReleaseTimestampsByVersion;
	nextMajorVersion: string; // semver without the 'v' prefix

	constructor(protected currentVersion: string) {}

	public async init() {
		if (this.initialized) {
			return;
		}
		this.initialized = true;
		const semver = await import('semver');
		const major = semver.major(this.currentVersion, { loose: true });
		this.nextMajorVersion = `${major + 1}.0.0`;

		const settings = await import('balena-settings-client');
		const getStorage = await import('balena-settings-storage');
		const dataDirectory = settings.get<string>('dataDirectory');
		this.storage = getStorage({ dataDirectory });
		let stored: ReleaseTimestampsByVersion | undefined;
		try {
			stored = (await this.storage.get(
				this.cacheFile,
			)) as ReleaseTimestampsByVersion;
		} catch {
			// ignore
		}
		this.cachedTimestamps = {
			...stored,
			lastChecked: stored?.lastChecked || new Date(0).toISOString(),
		};
	}

	/**
	 * Get NPM registry URL to retrieve the package.json file for a given version.
	 * @param version Semver without 'v' prefix, e.g. '12.0.0.'
	 */
	protected getNpmUrl(version: string) {
		return `http://registry.npmjs.org/balena-cli/${version}`;
	}

	protected async fetchPackageJson(
		version: string,
	): Promise<Dictionary<any> | undefined> {
		const { default: got } = await import('got');
		const url = this.getNpmUrl(version);
		let response: import('got').Response<Dictionary<any>>;
		try {
			response = await got(url, { responseType: 'json', retry: 0 });
		} catch (e) {
			if (e.response?.statusCode === 404) {
				return;
			}
			throw e;
		}
		return response.body;
	}

	protected async fetchPublishedTimestampForVersion(
		version: string,
	): Promise<string | undefined> {
		let pj: Dictionary<any> | undefined;
		try {
			pj = await this.fetchPackageJson(version);
			console.error(`pj:${JSON.stringify(pj, null, 4)}`);
		} catch (e) {
			if (process.env.DEBUG) {
				console.error(
					`[debug] ${this.debugPrefix}: Failed to query ${this.getNpmUrl(
						version,
					)}`,
				);
			}
			throw e;
		}
		const publishedAt: string | undefined = pj?.versionist?.publishedAt;
		if (process.env.DEBUG && !publishedAt) {
			console.error(
				`[debug] ${this.debugPrefix}: next major version "${this.nextMajorVersion}" not released or release date not available`,
			);
		}
		return publishedAt; // ISO 8601, e.g. '2021-06-27T16:46:10.000Z'
	}

	public async checkForNewReleases() {
		await this.init();
		if (this.cachedTimestamps[this.nextMajorVersion]) {
			// A cached value exists: no need to check the npm registry
			return;
		}
		const lastChecked = new Date(this.cachedTimestamps.lastChecked).getTime();
		const daysSinceLastCheck = (this.now - lastChecked) / this.msInDay;
		if (daysSinceLastCheck < this.majorVersionCheckIntervalDays) {
			if (process.env.DEBUG) {
				// toFixed(5) results in a precision of 1 second
				console.error(`\
[debug] ${this.debugPrefix}: ${daysSinceLastCheck.toFixed(
					5,
				)} days since last npm registry query for next major version release date.
[debug] Will not query again until at least ${
					this.majorVersionCheckIntervalDays
				} days have passed.`);
			}
			return;
		}
		if (process.env.DEBUG) {
			console.error(`\
[debug] ${this.debugPrefix}: Cache miss for next major version release date.
[debug] Will query ${this.getNpmUrl(this.nextMajorVersion)}`);
		}
		let publishedAt: string | undefined;
		try {
			publishedAt = await this.fetchPublishedTimestampForVersion(
				this.nextMajorVersion,
			);
		} catch (e) {
			if (process.env.DEBUG) {
				console.error(`[debug] ${this.debugPrefix}: ${e}`);
			}
		}
		// store results to cache file
		if (publishedAt) {
			this.cachedTimestamps[this.nextMajorVersion] = publishedAt;
			this.cachedTimestamps.lastChecked = new Date(this.now).toISOString();
			await this.storage.set(this.cacheFile, this.cachedTimestamps);
		}
	}

	public async checkDeprecated() {
		await this.init();
		const nextMajorDateStr = this.cachedTimestamps[this.nextMajorVersion];
		if (!nextMajorDateStr) {
			return;
		}
		const nextMajorDate = new Date(nextMajorDateStr).getTime();
		const now = new Date().getTime();
		const daysElapsed = Math.trunc((now - nextMajorDate) / this.msInDay);
		if (daysElapsed > this.expiryDays) {
			const expiryMsg = `
This version of the balena CLI (${this.currentVersion}) has expired: please upgrade.
${daysElapsed} days have passed since the release of CLI version ${this.nextMajorVersion}.
See deprecation policy at:
https://github.com/balena-io/balena-cli/blob/master/README.md#deprecation-policy

The --unsupported flag may be used to bypass this deprecation check and continue
using this version of the CLI. However, note that the balenaCloud or openBalena
backends may be updated in a way that is no longer compatible with this version.`
				.split('\n')
				.join('\n[warn] ');
			const { ExpectedError } = await import('./errors');
			throw new ExpectedError(expiryMsg);
		} else if (daysElapsed > this.deprecationDays && !!process.stdout.isTTY) {
			const deprecationMsg = `
CLI version ${this.nextMajorVersion} was released ${daysElapsed} days ago: please upgrade.
This version of the balena CLI (${this.currentVersion}) will stop working after ${this.expiryDays}
days from the release of version ${this.nextMajorVersion}, as per deprecation policy:
https://github.com/balena-io/balena-cli/blob/master/README.md#deprecation-policy

The --unsupported flag may be used to bypass this deprecation check and allow the
CLI to keep working beyond the deprecation period. However, note that the balenaCloud
or openBalena backends may be updated in a way that is no longer compatible with this
version.`
				.split('\n')
				.join('\n[warn] ');
			console.error(deprecationMsg);
		}
	}
}
