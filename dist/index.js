"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertResx = void 0;
const fs = require("fs");
const path = require("path");
const fileseek_plus_1 = require("fileseek_plus");
const xml2js_1 = require("xml2js");
class Options {
    constructor(optionsObject) {
        this.mergeCulturesToSingleFile = true;
        this.generateTypeScriptResourceManager = true;
        this.searchRecursive = false;
        this.defaultResxCulture = 'en';
        if (optionsObject == null) {
            return;
        }
        if (optionsObject.hasOwnProperty('mergeCulturesToSingleFile') && typeof optionsObject.mergeCulturesToSingleFile == 'boolean') {
            this.mergeCulturesToSingleFile = optionsObject.mergeCulturesToSingleFile;
        }
        if (optionsObject.hasOwnProperty('generateTypeScriptResourceManager') && typeof optionsObject.generateTypeScriptResourceManager == 'boolean') {
            this.generateTypeScriptResourceManager = optionsObject.generateTypeScriptResourceManager;
        }
        if (optionsObject.hasOwnProperty('searchRecursive') && typeof optionsObject.searchRecursive == 'boolean') {
            this.searchRecursive = optionsObject.searchRecursive;
        }
        if (optionsObject.hasOwnProperty('defaultResxCulture') && typeof optionsObject.defaultResxCulture == 'string') {
            this.defaultResxCulture = optionsObject.defaultResxCulture;
        }
    }
}
function convertResx(resxInput, outputFolder, options = null) {
    // Read and validate the users options
    let OptionsInternal = new Options(options);
    // Check if an Input-Path was given
    if (resxInput === undefined || resxInput === '') {
        // files = search.recursiveSearchSync(/.resx$/, __dirname + virtualProjectRoot );
        console.error('No input-path given');
        return;
    }
    // Normalize the output path
    outputFolder = path.normalize(outputFolder);
    // Get the resx-file(s) from the input path
    let files = [];
    files = findFiles(resxInput, OptionsInternal.searchRecursive);
    // Check wether there are some files in the Input path
    if (files.length < 1) {
        console.log('No *.resx-files found in the input path.');
        return;
    }
    // Sort the files for their base resource and their culture
    let filesSorted = sortFilesByRes(files, OptionsInternal.defaultResxCulture);
    // Generate the JSON from the files (and get a list of all keys for the resource-manager generation)
    let resourceNameList = generateJson(filesSorted, outputFolder, OptionsInternal.mergeCulturesToSingleFile);
    // Generate the resource-manager (if set in the options)
    if (OptionsInternal.generateTypeScriptResourceManager) {
        generateResourceManager(outputFolder, resourceNameList, OptionsInternal.mergeCulturesToSingleFile, OptionsInternal.defaultResxCulture);
    }
    return;
}
exports.convertResx = convertResx;
let parser;
function findFiles(resxInput, recursiveSearch) {
    if (resxInput == null) {
        console.error('No input filepath given');
        return [];
    }
    if (typeof resxInput == 'string') {
        return getFilesForPath(resxInput, recursiveSearch);
    }
    if (!Array.isArray(resxInput)) {
        console.warn('The given input path is neither an string[] nor a single string');
        return [];
    }
    let files = [];
    for (let inPath of resxInput) {
        let filesInPath = getFilesForPath(inPath, recursiveSearch);
        for (let file of filesInPath) {
            if (!files.includes(file)) {
                files.push(file);
            }
        }
    }
    return files;
}
function getFilesForPath(inputPath, recursiveSearch) {
    let files = [];
    if (inputPath.endsWith('.resx')) {
        if (!fs.existsSync(inputPath)) {
            console.warn(`The file or path '${inputPath}' could not be found.`);
            return files;
        }
        files.push(inputPath);
        return files;
    }
    //TODO wait for the fileseek maintainer to merge my pull request
    files = fileseek_plus_1.default(inputPath, /.resx$/, recursiveSearch);
    return files;
}
function sortFilesByRes(inputFiles, defaultCulture) {
    let sorted = {};
    for (let file of inputFiles) {
        //Filename and Culture
        let info = getResxFileInfo(file);
        if (info.culture == null) {
            info.culture = defaultCulture;
        }
        if (!sorted.hasOwnProperty(info.name)) {
            sorted[info.name] = {};
        }
        sorted[info.name][info.culture] = file;
    }
    return sorted;
}
function generateJson(resxFiles, outputFolder, mergeCultures) {
    if (parser == undefined || parser == null) {
        parser = new xml2js_1.Parser();
    }
    //Create the Directory before we write to it
    if (!fs.existsSync(outputFolder)) {
        fs.mkdirSync(outputFolder, { recursive: true });
    }
    let resourceFileKeyCollection = {};
    for (const resxFileName in resxFiles) {
        let cultureFiles = resxFiles[resxFileName];
        let resourceKeys;
        if (mergeCultures) {
            resourceKeys = generateJsonMerged(outputFolder, cultureFiles, resxFileName);
        }
        else {
            resourceKeys = generateJsonSingle(outputFolder, cultureFiles, resxFileName);
        }
        resourceFileKeyCollection[resxFileName] = resourceKeys;
    }
    return resourceFileKeyCollection;
}
function generateJsonMerged(outputFolder, cultureFiles, resourceName) {
    let resKeys = [];
    let o = {};
    for (let culture in cultureFiles) {
        let file = cultureFiles[culture];
        let resxContentObject = getResxKeyValues(file);
        o[culture] = resxContentObject;
        // Add the ResourceKeys to the key collection
        for (let key of Object.keys(resxContentObject)) {
            if (!resKeys.includes(key)) {
                resKeys.push(key);
            }
        }
    }
    //Json stringify
    let content = JSON.stringify(o);
    //Write the file
    let targetFileName = `${resourceName}.json`;
    let targetPath = path.join(outputFolder, targetFileName);
    targetPath = path.normalize(targetPath);
    fs.writeFileSync(targetPath, content, { encoding: 'utf-8' });
    return {
        resourcename: resourceName,
        generatedFiles: [targetFileName],
        resxKeys: resKeys
    };
}
function generateJsonSingle(outputFolder, cultureFiles, resourceName) {
    let resKeys = [];
    let targetFiles = [];
    for (let culture in cultureFiles) {
        let file = cultureFiles[culture];
        let resxContentObject = getResxKeyValues(file);
        let o = {};
        o[culture] = resxContentObject;
        //Json strinify
        let content = JSON.stringify(o);
        //Write the file
        let targetFileName = `${resourceName}.${culture}.json`;
        let targetPath = path.join(outputFolder, targetFileName);
        targetPath = path.normalize(targetPath);
        fs.writeFileSync(targetPath, content, { encoding: 'utf-8' });
        targetFiles.push(targetFileName);
        // Add the ResourceKeys to the key collection
        for (let key of Object.keys(resxContentObject)) {
            if (!resKeys.includes(key)) {
                resKeys.push(key);
            }
        }
    }
    return {
        resourcename: resourceName,
        generatedFiles: targetFiles,
        resxKeys: resKeys
    };
}
function generateResourceManager(outputFolder, resourceNameList, isResourcesMergedByCulture, defaultCulture) {
    let classesString = '';
    let classInstancesString = '';
    for (let resourceInfo of Object.values(resourceNameList)) {
        let resourceName = resourceInfo.resourcename;
        classInstancesString += `
    private _${resourceName}: ${resourceName} = new ${resourceName}(this);
    get ${resourceName}(): ${resourceName} {
        return this._${resourceName};
    }
    `;
        let resourceGetters = '';
        for (let resxIdentifier of resourceInfo.resxKeys) {
            resourceGetters += `
    get ${resxIdentifier}(): string {
        return this.get('${resxIdentifier}');
    }
    `;
        }
        if (isResourcesMergedByCulture) {
            classesString += `
import * as resx${resourceName} from './${resourceInfo.generatedFiles[0].trim()}';

export class ${resourceName} extends resourceFile {

    constructor(resourceManager: resourceManager) {
        super(resourceManager);
        this.resources = (<any>resx${resourceName}).default;
    }
    ${resourceGetters}
}
 `;
        }
        else {
            let importStatements = '';
            let importNames = [];
            let resourceConstruction = '';
            for (let filename of resourceInfo.generatedFiles) {
                let importname = '' + filename;
                importname.replace('.', '_');
                importNames.push(importname);
                importStatements += `
                import * as ${importname} from './${filename}'`;
            }
            resourceConstruction = importNames.join(', ');
            classesString = `
${importStatements}

export class P3JS_1 extends resourceFile {

    constructor(resourceManager: resourceManager) {
        super(resourceManager);
        this.resources = Object.assign(${resourceConstruction});
    }

    ${resourceGetters}
}
`;
        }
    }
    let resxManagerString = `
/**
 * This class gives you type-hinting for the automatic generated resx-json files
 */

export default class resourceManager {

    public language: string;

    constructor(language: string) {
        this.language = language;
    }

    public setLanguage(language: string) {
        this.language = language;
    };

    // Generated class instances start
    ${classInstancesString}
    // Gen end
}

abstract class resourceFile {
    protected resMan: resourceManager;
    protected resources: { [langKey: string]: { [resKey: string]: string } } = {};

    constructor(resourceManager: resourceManager) {
        this.resMan = resourceManager;
    }

    public get(resKey: string) {
        let language = this.resMan.language;

        // Check if the language exists for this resource and if the language has an corresponsing key
        if (this.resources.hasOwnProperty(language) && this.resources[language].hasOwnProperty(resKey)) {
            return this.resources[language][resKey];
        }

        // If no entry could be found in the currently active language, try the default language
        if (this.resources.hasOwnProperty('${defaultCulture}') && this.resources['${defaultCulture}'].hasOwnProperty(resKey)) {
            console.log(\`No text resource in the language "\${language}" with the key "\${resKey}".\`);
            return this.resources['${defaultCulture}'][resKey];
        }

        // If there is still no resource found output a warning and return the key.
        console.warn(\`No text-resource for the key \${resKey} found.\`);
        return resKey;
    };
}

// Gen Classes start
${classesString}
// Gen Classes end
`;
    //Write the file
    let targetFileName = `resourceManager.ts`;
    let targetPath = path.join(outputFolder, targetFileName);
    targetPath = path.normalize(targetPath);
    fs.writeFileSync(targetPath, resxManagerString, { encoding: 'utf-8' });
}
function getResxFileInfo(filePath) {
    let fileCulture = null;
    let nameClean;
    let filename = path.basename(filePath);
    let filenameSplit = filename.split('.');
    filenameSplit.pop();
    if (filenameSplit.length > 1) {
        fileCulture = filenameSplit.pop();
    }
    nameClean = filenameSplit.join('.');
    return {
        name: nameClean,
        culture: fileCulture
    };
}
function getResxKeyValues(filepath) {
    const resources = {};
    parser.reset();
    let fileContentString = fs.readFileSync(filepath, { encoding: 'utf-8' });
    parser.parseString(fileContentString, function (err, xmlObject) {
        if (xmlObject == undefined ||
            xmlObject == null ||
            !xmlObject.hasOwnProperty('root') ||
            !xmlObject.root.hasOwnProperty('data') ||
            xmlObject.root.data == undefined) {
            return;
        }
        for (let i in xmlObject.root.data) {
            const name = xmlObject.root.data[i].$.name;
            const value = xmlObject.root.data[i].value.toString();
            resources[name] = value;
        }
    });
    return resources;
}
//# sourceMappingURL=index.js.map