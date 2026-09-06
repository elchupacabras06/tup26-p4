#!/usr/bin/env node

const HELP = `

sortx — Ordena archivos de texto delimitados

USO:
    sortx <origen> <destino> [opciones]

ARGUMENTOS:
    origen              Archivo que se desea ordenar.
    destino             Archivo donde se guardará el resultado.

OPCIONES:
    -b, --by <criterio> Criterio de ordenamiento. Se puede repetir.
                        Formato: campo[:tipo[:orden]]
                        tipo: alpha (predeterminado) o num
                        orden: asc (predeterminado) o desc

    -d, --delimiter <c> Delimitador de un solo carácter.
                        Predeterminado: ","
                        Usá "\t" para archivos separados por tabulaciones.

    -nh, --no-header    Indica que el archivo no tiene encabezado.
                        Los campos se identifican mediante índices desde cero.

    -h, --help          Muestra esta ayuda.

EJEMPLOS:
    sortx empleados.csv ordenados.csv -b apellido
    sortx empleados.csv salarios.csv -b salario:num:desc
    sortx empleados.csv resultado.csv -b departamento -b salario:num:desc
    sortx datos.csv resultado.csv -nh -b 2:num:desc
    sortx datos.tsv salida.tsv -d "\t" -b nombre
`

import fs from 'node:fs'

function fail(message) {
    throw new Error(message)
}

function parseArgs(args) {
    const config = {
        inputFile: null,
        outputFile: null,
        delimiter: ',',
        noHeader: false,
        sortFields: [],
        help: false
    }
    const positional = []

    for (let index = 0; index < args.length; index += 1) {
        const argument = args[index]

        if (argument === '-h' || argument === '--help') {
            config.help = true
        } else if (argument === '-b' || argument === '--by') {
            const value = args[++index]
            if (!value || value.startsWith('-')) {
                fail(`La opción ${argument} requiere un criterio.`)
            }
            config.sortFields.push(parseSortField(value))
        } else if (argument === '-d' || argument === '--delimiter') {
            const value = args[++index]
            if (value === undefined) {
                fail(`La opción ${argument} requiere un delimitador.`)
            }
            config.delimiter = value === '\\t' ? '\t' : value
            if ([...config.delimiter].length !== 1) {
                fail('El delimitador debe ser un único carácter.')
            }
        } else if (argument === '-nh' || argument === '--no-header') {
            config.noHeader = true
        } else if (argument.startsWith('-')) {
            fail(`Opción desconocida: ${argument}`)
        } else {
            positional.push(argument)
        }
    }

    if (config.help) return config
    if (!positional[0]) fail('Falta el archivo de origen.')
    if (!positional[1]) fail('Falta el archivo de destino.')
    if (positional.length > 2) fail('Se indicaron demasiados argumentos de archivo.')
    if (config.sortFields.length === 0) {
        fail('Debe indicarse al menos un criterio con -b o --by.')
    }

    config.inputFile = positional[0]
    config.outputFile = positional[1]
    return config
}

function parseSortField(expression) {
    const parts = expression.split(':')
    if (parts.length > 3 || parts.some((part) => part === '')) {
        fail(`Criterio de ordenamiento inválido: ${expression}`)
    }

    const [name, type = 'alpha', order = 'asc'] = parts
    if (type !== 'alpha' && type !== 'num') fail(`Tipo de ordenamiento inválido: ${type}`)
    if (order !== 'asc' && order !== 'desc') fail(`Orden inválido: ${order}`)
    return { name, numeric: type === 'num', descending: order === 'desc' }
}

function readInput(inputFile) {
    try {
        return fs.readFileSync(inputFile, 'utf8')
    } catch (error) {
        fail(`No se puede leer el archivo de origen "${inputFile}": ${error.message}`)
    }
}

function parseDelimited(text, delimiter) {
    const normalized = text.replace(/\r\n?/g, '\n')
    if (normalized === '') return []
    const lines = normalized.endsWith('\n') ? normalized.slice(0, -1).split('\n') : normalized.split('\n')
    const rows = lines.map((line) => {
        if (line.includes('"')) fail('La entrada no admite comillas dobles.')
        return line.split(delimiter)
    })
    const fieldCount = rows[0].length
    if (rows.some((row) => row.length !== fieldCount)) {
        fail('Todas las filas deben tener la misma cantidad de campos.')
    }
    return rows
}

function sortRows(rows, config) {
    if (rows.length === 0) fail('El archivo de origen está vacío.')
    const header = config.noHeader ? null : rows[0]
    const dataRows = config.noHeader ? rows : rows.slice(1)
    const fields = config.sortFields.map((field) => {
        if (config.noHeader && !/^\d+$/.test(field.name)) {
            fail(`Sin encabezado, el campo debe ser un índice numérico: ${field.name}`)
        }
        const column = config.noHeader ? Number(field.name) : header.indexOf(field.name)
        if (column < 0 || column >= rows[0].length) {
            fail(`El campo solicitado no existe: ${field.name}`)
        }
        return { ...field, column }
    })

    for (const field of fields) {
        if (field.numeric && dataRows.some((row) => row[field.column].trim() === '' || !Number.isFinite(Number(row[field.column])))) {
            fail(`El valor del campo ${field.name} no es numérico.`)
        }
    }

    const sortedRows = [...dataRows].sort((left, right) => {
        for (const field of fields) {
            const leftValue = field.numeric ? Number(left[field.column]) : left[field.column]
            const rightValue = field.numeric ? Number(right[field.column]) : right[field.column]
            let comparison = field.numeric ? leftValue - rightValue : leftValue.localeCompare(rightValue, 'es')
            if (comparison !== 0) return field.descending ? -comparison : comparison
        }
        return 0
    })
    return config.noHeader ? sortedRows : [header, ...sortedRows]
}

function serialize(rows, delimiter) {
    return rows.map((row) => row.join(delimiter)).join('\n')
}

function writeOutput(outputFile, text) {
    try {
        fs.writeFileSync(outputFile, text, 'utf8')
    } catch (error) {
        fail(`No se puede escribir el archivo de destino "${outputFile}": ${error.message}`)
    }
}

function main() {
    try {
        const config = parseArgs(process.argv.slice(2))
        if (config.help) {
            console.log(HELP)
            return
        }
        const rows = parseDelimited(readInput(config.inputFile), config.delimiter)
        writeOutput(config.outputFile, serialize(sortRows(rows, config), config.delimiter))
    } catch (error) {
        console.error(`Error: ${error.message}`)
        process.exitCode = 1
    }
}

main()

