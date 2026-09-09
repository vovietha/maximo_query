<!-- # maximo_query_VVH

# Auto script in maximo
# Script name: EXEC_SQL
# body: -->

`
from psdi.server import MXServer
import java.sql.Types as Types

# Hàm escape ký tự đặc biệt cho chuỗi JSON
def escape_str(s):
    if s is None:
        return u""
    u_str = unicode(s)
    return u_str.replace(u'\\', u'\\\\').replace(u'"', u'\\"').replace(u'\n', u'\\n').replace(u'\r', u'\\r')

# Hàm xử lý giá trị các kiểu dữ liệu cột
def get_column_value(rs, md, col_idx):
    col_type = md.getColumnType(col_idx)
    # Xu ly cot BLOB va Binary Data
    if col_type in [Types.BLOB, Types.BINARY, Types.VARBINARY, Types.LONGVARBINARY]:
        return u"<BLOB>"
    # Xu ly cot CLOB / van ban dai
    elif col_type in [Types.CLOB, Types.NCLOB, Types.LONGVARCHAR]:
        try:
            clob = rs.getClob(col_idx)
            if clob is None:
                return u""
            length = int(min(clob.length(), 4000))
            return clob.getSubString(1, length)
        except:
            return u"<CLOB>"
    else:
        try:
            val = rs.getString(col_idx)
            return val if val is not None else u""
        except:
            try:
                obj = rs.getObject(col_idx)
                return unicode(obj) if obj is not None else u""
            except:
                return u"<DATA>"

# Lấy dữ liệu SQL từ HTTP Request
sql = requestBody if 'requestBody' in globals() and requestBody else ""

if not sql or sql.strip() == "":
    responseBody = '{"success": false, "error": "SQL query is empty!"}'
else:
    dbManager = MXServer.getMXServer().getDBManager()
    con = None
    stmt = None
    rs = None

    try:
        con = dbManager.getSequenceConnection()
        stmt = con.createStatement()

        cleanSql = sql.strip().rstrip(';')
        upperSql = cleanSql.upper()

        # 1. Xử lý lệnh COMMIT từ nút bấm Console
        if upperSql == "COMMIT":
            con.commit()
            json_unicode = u'{"success": true, "action": "EXECUTE", "message": "Đã COMMIT giao dịch thành công!"}'
            responseBody = json_unicode

        # 2. Xử lý lệnh ROLLBACK từ nút bấm Console
        elif upperSql == "ROLLBACK":
            con.rollback()
            json_unicode = u'{"success": true, "action": "EXECUTE", "message": "Đã ROLLBACK giao dịch thành công!"}'
            responseBody = json_unicode

        # 3. Xử lý câu lệnh SELECT / WITH
        elif upperSql.startswith("SELECT") or upperSql.startswith("WITH"):
            rs = stmt.executeQuery(cleanSql)
            md = rs.getMetaData()
            colCount = md.getColumnCount()

            rows = []
            while rs.next():
                fields = []
                for i in range(1, colCount + 1):
                    colName = unicode(md.getColumnName(i)).lower()
                    val = get_column_value(rs, md, i)
                    fields.append(u'"' + colName + u'":"' + escape_str(val) + u'"')
                rows.append(u"{" + u",".join(fields) + u"}")

            json_unicode = u'{"success": true, "action": "SELECT", "data": [' + u",".join(rows) + u']}'
            responseBody = json_unicode

        # 4. Xử lý câu lệnh DML (UPDATE / INSERT / DELETE)
        else:
            count = stmt.executeUpdate(cleanSql)
            con.commit()
            json_unicode = u'{"success": true, "action": "EXECUTE", "message": "Affected rows: ' + unicode(count) + u'"}'
            responseBody = json_unicode

    except Exception, e:
        err_unicode = u'{"success": false, "error": "' + escape_str(str(e)) + u'"}'
        responseBody = err_unicode.encode('utf-8')
    finally:
        if rs:
            try: rs.close()
            except: pass
        if stmt:
            try: stmt.close()
            except: pass
        if con:
            try: con.close()
            except: pass

`