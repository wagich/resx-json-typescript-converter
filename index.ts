declare const __dirname: string;
declare const require: any;

import * as fs from 'fs';
import * as path from 'path';
import fileseek from 'fileseek_plus';
import { Parser as XmlParser } from 'xml2js';

export interface res2TsOptions {
    mergeCulturesToSingleFile: boolean;
    generateTypeScriptResourceManager: boolean;
    searchRecursive: boolean;
    defaultResxCulture: string;
}

class Options implements res2TsOptions {

    public mergeCulturesToSingleFile: boolean = true;
    public generateTypeScriptResourceManager: boolean = true;
    public searchRecursive: boolean = false;
    public defaultResxCulture: string = 'en';

    constructor(optionsObject: res2TsOptions) {
        if(optionsObject == null) {
            return;
        }

        if(optionsObject.hasOwnProperty('mergeCulturesToSingleFile') && typeof optionsObject.mergeCulturesToSingleFile == 'boolean') {
            this.mergeCulturesToSingleFile = optionsObject.mergeCulturesToSingleFile;
        }

        if(optionsObject.hasOwnProperty('generateTypeScriptResourceManager') && typeof optionsObject.generateTypeScriptResourceManager == 'boolean') {
            this.generateTypeScriptResourceManager = optionsObject.generateTypeScriptResourceManager;
        }

        if(optionsObject.hasOwnProperty('searchRecursive') && typeof optionsObject.searchRecursive == 'boolean') {
            this.searchRecursive = optionsObject.searchRecursive;
        }

        if(optionsObject.hasOwnProperty('defaultResxCulture') && typeof optionsObject.defaultResxCulture == 'string') {
            this.defaultResxCulture = optionsObject.defaultResxCulture;
        }
    }
}

export function convertResx(resxInput: string | string[], outputFolder: string, options: res2TsOptions = null): void {

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
    let files: string[] = [];
    files = findFiles(resxInput, OptionsInternal.searchRecursive)

    // Check wether there are some files in the Input path
    if(files.length < 1) {
        console.log('No *.resx-files found in the input path.');
        return;
    }

    // Sort the files for their base resource and their culture
    let filesSorted = sortFilesByRes(files, OptionsInternal.defaultResxCulture);

    // Generate the JSON from the files (and get a list of all keys for the resource-manager generation)
    let resourceNameList = generateJson(filesSorted, outputFolder, OptionsInternal.mergeCulturesToSingleFile)

    // Generate the resource-manager (if set in the options)
    if(OptionsInternal.generateTypeScriptResourceManager) {
        generateResourceManager(outputFolder, resourceNameList, OptionsInternal.mergeCulturesToSingleFile, OptionsInternal.defaultResxCulture);
    }

    return;
}


let parser: XmlParser;

function findFiles(resxInput: string | string[], recursiveSearch: boolean): string[] {
    
    if(resxInput == null) {
        console.error('No input filepath given');
        return [];
    }
    
    if(typeof resxInput == 'string') {
        return getFilesForPath(resxInput, recursiveSearch);
    }
    
    if(!Array.isArray(resxInput)) {
        console.warn('The given input path is neither an string[] nor a single string');
        return [];
    }
    
    let files: string [] = [];
    for(let inPath of resxInput) {
        let filesInPath = getFilesForPath(inPath, recursiveSearch);
        for(let file of filesInPath) {
            if(!files.includes(file)) {
                files.push(file);
            }
        }
    }
    return files;
}

function getFilesForPath(inputPath: string, recursiveSearch: boolean): string[]{
    let files: string [] = [];

    if(inputPath.endsWith('.resx') ) {
        if(!fs.existsSync(inputPath)) {
            console.warn(`The file or path '${inputPath}' could not be found.`);
            return files;
        }
        files.push(inputPath);
        return files;
    }

    //TODO wait for the fileseek maintainer to merge my pull request
    files = fileseek(inputPath, /.resx$/, recursiveSearch);

    return files;
}

function sortFilesByRes(inputFiles: string [], defaultCulture: string): resxFiles {

    let sorted: resxFiles = {}

    for (let file of inputFiles)
    {
        //Filename and Culture
        let info = getResxFileInfo(file);

        if(info.culture == null) {
            info.culture = defaultCulture;
        }

        if(!sorted.hasOwnProperty(info.name)) {
            sorted[info.name] = {}
        }

        sorted[info.name][info.culture] = file;
    }

    return sorted;
}

function generateJson(resxFiles: resxFiles, outputFolder: string, mergeCultures: boolean): resourceFileKeyCollection {
    if(parser == undefined || parser == null) {
        parser = new XmlParser()
    }

    //Create the Directory before we write to it
    if(!fs.existsSync(outputFolder)) {
        fs.mkdirSync(outputFolder, {recursive: true})
    }

    let resourceFileKeyCollection: resourceFileKeyCollection = {};

    for (const resxFileName in resxFiles) {
        let cultureFiles = resxFiles[resxFileName];

        let resourceKeys: resxFileKeys;

        if(mergeCultures) {
            resourceKeys = generateJsonMerged(outputFolder, cultureFiles, resxFileName);
        } else {
            resourceKeys = generateJsonSingle(outputFolder, cultureFiles, resxFileName);
        }

        resourceFileKeyCollection[resxFileName] = resourceKeys;
    }

    return resourceFileKeyCollection;
}

function generateJsonMerged(outputFolder: string, cultureFiles: resxFileCulture, resourceName: string): resxFileKeys {

    let resKeys: string[] = [];

    let o: {[key: string]: resxKeyValues} = {};
    
    for (let culture in cultureFiles)
    {
        let file = cultureFiles[culture];

        let resxContentObject = getResxKeyValues(file);

        o[culture] = resxContentObject;

        // Add the ResourceKeys to the key collection
        for(let key of Object.keys(resxContentObject)){
            if(!resKeys.includes(key)) {
                resKeys.push(key);
            }
        }
    }

    //Json stringify
    let content: string = JSON.stringify(o);

    //Write the file
    let targetFileName = `${resourceName}.json`;
    let targetPath = path.join(outputFolder, targetFileName);
    targetPath = path.normalize(targetPath);
    fs.writeFileSync(targetPath, content, {encoding: 'utf-8'});

    return {
        resourcename: resourceName,
        generatedFiles: [targetFileName],
        resxKeys: resKeys
    }
}

function generateJsonSingle(outputFolder: string, cultureFiles: resxFileCulture, resourceName: string): resxFileKeys {
    let resKeys: string[] = [];
    let targetFiles: string[] = [];

    for (let culture in cultureFiles)
    {
        let file = cultureFiles[culture];

        let resxContentObject = getResxKeyValues(file);

        let o: {[key: string]: resxKeyValues} = {};
        o[culture] = resxContentObject;

        //Json strinify
        let content: string = JSON.stringify(o);

        //Write the file
        let targetFileName = `${resourceName}.${culture}.json`;
        let targetPath = path.join(outputFolder, targetFileName);
        targetPath = path.normalize(targetPath);
        fs.writeFileSync(targetPath, content, {encoding: 'utf-8'});

        targetFiles.push(targetFileName);

        // Add the ResourceKeys to the key collection
        for(let key of Object.keys(resxContentObject)){
            if(!resKeys.includes(key)) {
                resKeys.push(key);
            }
        }
    }

    return {
        resourcename: resourceName,
        generatedFiles: targetFiles,
        resxKeys: resKeys
    }
}

function generateResourceManager(outputFolder: string, resourceNameList: resourceFileKeyCollection, isResourcesMergedByCulture: boolean, defaultCulture: string) {
    
    let classesString: string = '';
    let classInstancesString: string ='';

    for (let resourceInfo of Object.values(resourceNameList)) {

        let resourceName = resourceInfo.resourcename;

        classInstancesString += `
    private _${resourceName}: ${resourceName} = new ${resourceName}(this);
    get ${resourceName}(): ${resourceName} {
        return this._${resourceName};
    }
    `;

        let resourceGetters: string = '';
        for (let resxIdentifier of resourceInfo.resxKeys){
            resourceGetters += `
    get ${resxIdentifier}(): string {
        return this.get('${resxIdentifier}');
    }
    `;
        }

        if(isResourcesMergedByCulture) {
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
        } else {
            let importStatements: string = '';
            let importNames: string[] = [];
            let resourceConstruction: string = '';


            for(let filename of resourceInfo.generatedFiles) {
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
    fs.writeFileSync(targetPath, resxManagerString, {encoding: 'utf-8'});
}

function getResxFileInfo(filePath: string): resxFileInfo {
    let fileCulture: string = null;
    let nameClean: string;

    let filename: string = path.basename(filePath);
    let filenameSplit = filename.split('.');
    filenameSplit.pop();

    if(filenameSplit.length > 1) {
        fileCulture = filenameSplit.pop();
    }

    nameClean = filenameSplit.join('.');

    return {
        name: nameClean,
        culture: fileCulture
    }
}

function getResxKeyValues(filepath: string): resxKeyValues {

    const resources: resxKeyValues = {};

    parser.reset();

    let fileContentString = fs.readFileSync(filepath, {encoding: 'utf-8'})

    parser.parseString(fileContentString, function (err: any, xmlObject: any) {

        if(xmlObject == undefined ||
            xmlObject == null ||
            !xmlObject.hasOwnProperty('root') ||
            !xmlObject.root.hasOwnProperty('data') ||
            xmlObject.root.data == undefined) {

            return;
        }

        for (let i in xmlObject.root.data)
        {
            const name = xmlObject.root.data[i].$.name;
            const value =  xmlObject.root.data[i].value.toString();

            resources[name] = value;
        }

    });

    return resources;
}

interface resxFileInfo {
    name: string;
    culture: string;
}

interface resxFiles {
    [key: string]: resxFileCulture;
}

interface resxFileCulture {
    [key: string]: string;
}

interface resxKeyValues {
    [key: string]: string;
}

interface resxFileKeys {
    resourcename: string;
    generatedFiles: string[];
    resxKeys: string[];
}

interface resourceFileKeyCollection {
    [resourceFileName: string]: resxFileKeys
}
