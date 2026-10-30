package com.netmate.app

import android.animation.TimeAnimator
import android.animation.ValueAnimator
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.*
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.LayerDrawable
import android.graphics.drawable.RippleDrawable
import android.util.AttributeSet
import android.view.Gravity
import android.view.View
import android.view.animation.PathInterpolator
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin

/**
 * Sky theme tokens from design/app.css (PORT-SPEC.md §2). All drawing uses platform primitives on the
 * software Canvas; only the day/night toggle animates, and only while the window is active.
 */
internal class NetMateAppearance(var dark: Boolean, private val density: Float) {
    /** --ground */
    val background get() = color(if(dark) "#0a1222" else "#eaf3fc")
    /** --surface */
    val card get() = color(if(dark) "#111c31" else "#ffffff")
    /** --surface-2 */
    val surface2 get() = color(if(dark) "#16233b" else "#f2f7fc")
    /** --line, used for card strokes, row separators and field outlines. */
    val line get() = color(if(dark) "#22324d" else "#d9e6f2")
    val border get() = line
    val outline get() = line
    val text get() = color(if(dark) "#e4ebf5" else "#0f2a44")
    val secondary get() = color(if(dark) "#94a6bf" else "#4f6a84")
    /** --accent: blue by day, moonlight gold by night. */
    val primary get() = color(if(dark) "#f0d98a" else "#2370c0")
    val accentSoft get() = if(dark) 0x21f0d98a else color("#e1eefb")
    val onPrimary get() = if(dark) color("#1a1606") else Color.WHITE
    val success get() = color(if(dark) "#5fd39f" else "#17865c")
    val successSoft get() = if(dark) 0x1f5fd39f else color("#e0f4ea")
    val warning get() = color(if(dark) "#f2b45a" else "#a8650a")
    val danger get() = color(if(dark) "#ff7b7b" else "#c93838")
    val dangerSoft get() = if(dark) 0x1fff7b7b else color("#fbe5e5")
    val tabFill get() = card
    val cell get() = surface2
    val fieldFill get() = card
    /** Top bar text (--rail-text). */
    val railText get() = color(if(dark) "#e4ebf5" else "#ffffff")
    fun dp(value: Int) = (value*density+.5f).toInt()
    fun alpha(value: Int, alpha: Int) = (value and 0x00ffffff) or (alpha shl 24)
    fun weight(value: Int): Typeface = Typeface.create(Typeface.DEFAULT, value, false)
    fun rounded(radius: Float, fill: Int, stroke: Int? = null, strokeWidth: Float = 1f): GradientDrawable = GradientDrawable().apply {
        cornerRadius=radius*density; setColor(fill); if(stroke!=null) setStroke((strokeWidth*density+.5f).toInt().coerceAtLeast(1), stroke)
    }
    /** .panel: radius 14 with a 1dp line stroke. Software rendering draws no elevation shadow, so only the stroke is kept. */
    fun surface(radius: Int = 14, fill: Int = card): GradientDrawable = rounded(radius.toFloat(), fill, line)
    /** The mask keeps the ripple visible on transparent text buttons. */
    fun pressable(shape: Drawable, radius: Float = 9f): Drawable = RippleDrawable(ColorStateList.valueOf(alpha(primary, 0x28)), shape, rounded(radius, Color.WHITE))
    /** .phone .tabbar: surface with a 1dp top line. */
    fun tabBar(): Drawable = LayerDrawable(arrayOf<Drawable>(ColorDrawable(card), ColorDrawable(line))).apply { setLayerGravity(1, Gravity.TOP or Gravity.FILL_HORIZONTAL); setLayerHeight(1, dp(1)) }
    fun bottomLine(): Drawable = edge(Gravity.BOTTOM)
    fun topLine(): Drawable = edge(Gravity.TOP)
    fun startLine(): Drawable = LayerDrawable(arrayOf<Drawable>(ColorDrawable(line))).apply { setLayerGravity(0, Gravity.START or Gravity.FILL_VERTICAL); setLayerWidth(0, dp(1)) }
    private fun edge(side: Int): Drawable = LayerDrawable(arrayOf<Drawable>(ColorDrawable(line))).apply { setLayerGravity(0, side or Gravity.FILL_HORIZONTAL); setLayerHeight(0, dp(1)) }
    /** .list.wifi .current: accent-soft fill and a 3dp accent bar on the left. */
    fun currentRow(separator: Boolean): Drawable {
        val layers = mutableListOf<Drawable>(ColorDrawable(accentSoft), ColorDrawable(primary))
        if(separator) layers.add(ColorDrawable(line))
        return LayerDrawable(layers.toTypedArray()).apply {
            setLayerGravity(1, Gravity.START or Gravity.FILL_VERTICAL); setLayerWidth(1, dp(3))
            if(separator){ setLayerGravity(2, Gravity.TOP or Gravity.FILL_HORIZONTAL); setLayerHeight(2, dp(1)) }
        }
    }
    /** Dropdown face (PORT-SPEC §6): input look with a chevron; open = accent stroke and the chevron turned up. */
    fun dropdown(expanded: Boolean): Drawable {
        val face = rounded(9f, card, if(expanded) primary else line, if(expanded) 1.5f else 1f)
        val arrow = NetMateIcon("chevron", if(expanded) primary else secondary, dp(16), if(expanded) 180f else 0f)
        return LayerDrawable(arrayOf<Drawable>(pressable(face), arrow)).apply {
            setLayerGravity(1, Gravity.END or Gravity.CENTER_VERTICAL); setLayerInsetEnd(1, dp(12)); setLayerSize(1, dp(16), dp(16))
        }
    }
    /** Dropdown popup: surface, radius 11, line stroke, 5dp inner padding. */
    fun popup(): Drawable = rounded(11f, card, line).apply { setPadding(dp(5), dp(5), dp(5), dp(5)) }
    fun background(): Drawable = ColorDrawable(background)
    fun topBar(): Drawable = TopBarDrawable(dark, density)
    fun sky(weather: Weather): Drawable = SkyDrawable(dark, weather, density)
    fun icon(kind: String, tint: Int, size: Int = 18) = NetMateIcon(kind, tint, dp(size))
    fun tabIcon(kind: String, active: Boolean) = TabIcon(NetMateIcon(kind, if(active) primary else secondary, dp(22)), if(active) accentSoft else Color.TRANSPARENT, density)
    private fun color(value: String) = Color.parseColor(value)
}

internal enum class Weather { Clear, Cloud, Storm }

/** CSS linear-gradient(angle) over a rectangle: 0° points up, 90° right. */
private fun angled(left: Float, top: Float, width: Float, height: Float, degrees: Float, colors: IntArray, stops: FloatArray): LinearGradient {
    val radians = Math.toRadians(degrees.toDouble()); val dx = sin(radians).toFloat(); val dy = -cos(radians).toFloat()
    val half = abs(width/2*dx) + abs(height/2*dy); val cx = left + width/2; val cy = top + height/2
    return LinearGradient(cx - dx*half, cy - dy*half, cx + dx*half, cy + dy*half, colors, stops, Shader.TileMode.CLAMP)
}
private fun hex(value: String) = Color.parseColor(value)
private fun fade(value: Float) = (value.coerceIn(0f, 1f)*255+.5f).toInt()

/** .phone .rail: vertical rail gradient; sparse white dots at night. Drawn once per theme. */
internal class TopBarDrawable(private val dark: Boolean, private val density: Float) : Drawable() {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val stars = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE; alpha = 204 }
    override fun onBoundsChange(bounds: Rect) {
        paint.shader = LinearGradient(0f, bounds.top.toFloat(), 0f, bounds.bottom.toFloat(),
            if(dark) hex("#070d1c") else hex("#2a68ad"), if(dark) hex("#15213b") else hex("#4a90d9"), Shader.TileMode.CLAMP)
    }
    override fun draw(canvas: Canvas) {
        val b = bounds; canvas.drawRect(b, paint)
        if(!dark) return
        for(i in 0 until 14) canvas.drawCircle(b.left + b.width()*((i*41)%95)/100f, b.top + b.height()*((i*29)%70)/100f, density, stars)
    }
    override fun setAlpha(alpha: Int) { paint.alpha = alpha }
    override fun setColorFilter(filter: ColorFilter?) { paint.colorFilter = filter }
    @Deprecated("Deprecated in Java") override fun getOpacity() = PixelFormat.OPAQUE
}

/**
 * .sky panel: 160° gradient per weather and theme, stars at night and the static weather illustration
 * (viewBox 220×150 drawn at 150×102dp, right 8 / top 6 as in the phone prototype).
 */
internal class SkyDrawable(private val dark: Boolean, private val weather: Weather, private val density: Float) : Drawable() {
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val rect = RectF()
    override fun onBoundsChange(bounds: Rect) {
        rect.set(bounds)
        val colors = when(weather) {
            Weather.Clear -> if(dark) arrayOf("#070d1c", "#111a30", "#1f3156") else arrayOf("#3d84d0", "#6fb0ee", "#a9d3f7")
            Weather.Cloud -> if(dark) arrayOf("#141b2c", "#253149", "#34415a") else arrayOf("#6b8fb6", "#9db8d4", "#c9d8e6")
            Weather.Storm -> if(dark) arrayOf("#1d1416", "#3a2427", "#4b3033") else arrayOf("#56606f", "#7d8795", "#a5adb8")
        }
        val middle = if(dark && weather == Weather.Clear) .55f else .6f
        fill.shader = angled(rect.left, rect.top, rect.width(), rect.height(), 160f, colors.map(::hex).toIntArray(), floatArrayOf(0f, middle, 1f))
    }
    override fun draw(canvas: Canvas) {
        val radius = 16*density
        canvas.drawRoundRect(rect, radius, radius, fill)
        if(dark && weather != Weather.Storm) {
            paint.shader = null; paint.color = Color.WHITE; paint.alpha = fade(if(weather == Weather.Clear) .85f else .35f)
            for(i in 0 until 18) canvas.drawCircle(rect.left + rect.width()*((i*37+39)%97)/100f, rect.top + rect.height()*((i*53+21)%89)/100f, density, paint)
        }
        val width = 150*density
        val save = canvas.save()
        canvas.translate(rect.right - 8*density - width, rect.top + 6*density); canvas.scale(width/220f, width/220f)
        WeatherArt.draw(canvas, paint, dark, weather)
        canvas.restoreToCount(save)
    }
    override fun setAlpha(alpha: Int) { fill.alpha = alpha }
    override fun setColorFilter(filter: ColorFilter?) { fill.colorFilter = filter }
    @Deprecated("Deprecated in Java") override fun getOpacity() = PixelFormat.TRANSLUCENT
}

/** The weather SVG of design/app.js in its own 220×150 coordinates; shaders and paths are built once. */
private object WeatherArt {
    /** CLOUD path of app.js: its four arcs as circles, joined and cut flat at y = 60. */
    val cloud: Path = Path().apply {
        addCircle(27.89f, 42f, 18f, Path.Direction.CW)
        op(Path().apply { addCircle(51.76f, 27.66f, 26f, Path.Direction.CW) }, Path.Op.UNION)
        op(Path().apply { addCircle(77.2f, 35.9f, 20f, Path.Direction.CW) }, Path.Op.UNION)
        op(Path().apply { addCircle(91.16f, 44.25f, 16f, Path.Direction.CW) }, Path.Op.UNION)
        op(Path().apply { addRect(27.89f, 36f, 91.17f, 60f, Path.Direction.CW) }, Path.Op.UNION)
        op(Path().apply { addRect(0f, 0f, 120f, 60f, Path.Direction.CW) }, Path.Op.INTERSECT)
    }
    private fun vertical(top: String, middle: String?, bottom: String) = if(middle == null)
        LinearGradient(0f, 1.66f, 0f, 60f, hex(top), hex(bottom), Shader.TileMode.CLAMP)
        else LinearGradient(0f, 1.66f, 0f, 60f, intArrayOf(hex(top), hex(middle), hex(bottom)), floatArrayOf(0f, .7f, 1f), Shader.TileMode.CLAMP)
    val dayCloud = vertical("#ffffff", "#f3f8fe", "#d6e6f7")
    val greyCloud = vertical("#e3e7ec", null, "#a9b2bd")
    val nightCloud = vertical("#5d6c8c", null, "#36425c")
    val nightGreyCloud = vertical("#5a5258", null, "#352d33")
    val sunGlow = RadialGradient(138f, 50f, 58f, intArrayOf(0x8cffe680.toInt(), 0x8cffe680.toInt(), 0x00ffe680), floatArrayOf(0f, .45f, 1f), Shader.TileMode.CLAMP)
    val moonGlow = RadialGradient(138f, 50f, 58f, intArrayOf(0x59ffecb0, 0x59ffecb0, 0x00ffecb0), floatArrayOf(0f, .4f, 1f), Shader.TileMode.CLAMP)
    val sun = RadialGradient(129.6f, 40.4f, 30f, intArrayOf(hex("#fff5c0"), hex("#ffd84d"), hex("#ffc107")), floatArrayOf(0f, .7f, 1f), Shader.TileMode.CLAMP)
    val moon = RadialGradient(129.04f, 39.92f, 28f, intArrayOf(Color.WHITE, hex("#fff6d9"), hex("#f2e3a8")), floatArrayOf(0f, .55f, 1f), Shader.TileMode.CLAMP)

    fun draw(canvas: Canvas, paint: Paint, dark: Boolean, weather: Weather) {
        val storm = weather == Weather.Storm
        val glow = when(weather) { Weather.Clear -> 1f; Weather.Cloud -> .35f; Weather.Storm -> 0f }
        val light = when(weather) { Weather.Clear -> 1f; Weather.Cloud -> .6f; Weather.Storm -> 0f }
        paint.style = Paint.Style.FILL; paint.color = Color.WHITE
        if(glow > 0f) { paint.shader = if(dark) moonGlow else sunGlow; paint.alpha = fade(glow); canvas.drawCircle(138f, 50f, 58f, paint) }
        if(light > 0f) {
            paint.alpha = fade(light)
            if(dark) {
                paint.shader = moon; canvas.drawCircle(138f, 50f, 28f, paint)
                paint.shader = null; paint.color = hex("#ecdca6")
                paint.alpha = fade(.55f*light); canvas.drawCircle(128f, 44f, 5f, paint)
                paint.alpha = fade(.5f*light); canvas.drawCircle(147f, 60f, 3.5f, paint)
                paint.alpha = fade(.45f*light); canvas.drawCircle(146f, 39f, 2.5f, paint)
            } else { paint.shader = sun; canvas.drawCircle(138f, 50f, 30f, paint) }
        }
        paint.color = Color.WHITE
        paint.shader = when { dark && storm -> nightGreyCloud; dark -> nightCloud; storm -> greyCloud; else -> dayCloud }
        if(weather != Weather.Clear) {
            paint.alpha = fade(.75f)
            val save = canvas.save(); canvas.translate(6f, 24f); canvas.scale(.82f, .82f); canvas.drawPath(cloud, paint); canvas.restoreToCount(save)
        }
        paint.alpha = fade(if(dark && weather == Weather.Clear) .5f else 1f)
        // feDropShadow dy 6 / std 6; a static draw, not repeated per frame.
        paint.setShadowLayer(6f, 0f, 6f, if(dark) 0x40000000 else 0x381b4f86)
        val save = canvas.save(); canvas.translate(62f, 50f); canvas.scale(1.3f, 1.3f); canvas.drawPath(cloud, paint); canvas.restoreToCount(save)
        paint.clearShadowLayer(); paint.shader = null
        if(storm) {
            paint.style = Paint.Style.STROKE; paint.strokeWidth = 3f; paint.color = hex(if(dark) "#8ea3c7" else "#d7ebff"); paint.alpha = fade(.9f)
            for(x in floatArrayOf(112f, 134f, 156f, 178f)) canvas.drawLine(x, 136f, x - 6f, 148f, paint)
            paint.style = Paint.Style.FILL
        }
    }
}

/** .sky-bar: translucent track with a white (night: accent) fill, at most 320dp wide. */
internal class SkyBarDrawable(private val fraction: Float, private val fillColor: Int, private val density: Float) : Drawable() {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    override fun draw(canvas: Canvas) {
        val b = bounds; val width = minOf(b.width().toFloat(), 320*density); val r = b.height()/2f
        paint.color = 0x47ffffff; canvas.drawRoundRect(b.left.toFloat(), b.top.toFloat(), b.left + width, b.bottom.toFloat(), r, r, paint)
        paint.color = fillColor; canvas.drawRoundRect(b.left.toFloat(), b.top.toFloat(), b.left + width*fraction.coerceIn(0f, 1f), b.bottom.toFloat(), r, r, paint)
    }
    override fun setAlpha(alpha: Int) { paint.alpha = alpha }
    override fun setColorFilter(filter: ColorFilter?) { paint.colorFilter = filter }
    @Deprecated("Deprecated in Java") override fun getOpacity() = PixelFormat.TRANSLUCENT
}

/** Stroke icons of design/app.js (24×24 viewBox, stroke 2, round caps). */
internal class NetMateIcon(private val kind: String, private val color: Int, private val size: Int, private val rotation: Float = 0f) : Drawable() {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 2f; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND }
    private fun Path.arc(cx: Float, cy: Float, r: Float, start: Float, sweep: Float) = arcTo(cx - r, cy - r, cx + r, cy + r, start, sweep, true)
    override fun draw(canvas: Canvas) {
        val save = canvas.save(); canvas.translate(bounds.left.toFloat(), bounds.top.toFloat()); canvas.scale(bounds.width()/24f, bounds.height()/24f)
        if(rotation != 0f) canvas.rotate(rotation, 12f, 12f)
        paint.color = color; val p = Path()
        when(kind) {
            "运行状态", "wifi" -> {
                p.arc(12f, 21f, 11f, -129.8f, 79.6f); p.arc(12f, 21f, 6f, -125.4f, 70.8f)
                if(kind == "运行状态") p.arc(12f, 21f, 16f, -131.4f, 82.8f)
                canvas.drawCircle(12f, 20f, 1f, paint)
            }
            "配置设置" -> {
                for((x, a, b) in listOf(Triple(4f, 14f, 10f), Triple(12f, 12f, 8f), Triple(20f, 16f, 12f))) { p.moveTo(x, 21f); p.lineTo(x, a); p.moveTo(x, b); p.lineTo(x, 3f) }
                p.moveTo(1f, 14f); p.lineTo(7f, 14f); p.moveTo(9f, 8f); p.lineTo(15f, 8f); p.moveTo(17f, 16f); p.lineTo(23f, 16f)
            }
            "refresh" -> { p.arc(12f, 12f, 9f, 0f, 315f); p.lineTo(21f, 8f); p.moveTo(21f, 3f); p.lineTo(21f, 8f); p.lineTo(16f, 8f) }
            "search" -> { canvas.drawCircle(11f, 11f, 7f, paint); p.moveTo(20f, 20f); p.lineTo(16.5f, 16.5f) }
            "check" -> { p.moveTo(20f, 6f); p.lineTo(9f, 17f); p.lineTo(4f, 12f) }
            "chevron" -> { p.moveTo(6f, 9f); p.lineTo(12f, 15f); p.lineTo(18f, 9f) }
            else -> {
                p.moveTo(14f, 2f); p.lineTo(6f, 2f); p.quadTo(4f, 2f, 4f, 4f); p.lineTo(4f, 20f); p.quadTo(4f, 22f, 6f, 22f); p.lineTo(18f, 22f); p.quadTo(20f, 22f, 20f, 20f); p.lineTo(20f, 8f); p.close()
                p.moveTo(14f, 2f); p.lineTo(14f, 8f); p.lineTo(20f, 8f); p.moveTo(8f, 13f); p.lineTo(16f, 13f); p.moveTo(8f, 17f); p.lineTo(13f, 17f)
            }
        }
        canvas.drawPath(p, paint); canvas.restoreToCount(save)
    }
    override fun getIntrinsicWidth() = size; override fun getIntrinsicHeight() = size
    override fun setAlpha(alpha: Int) { paint.alpha = alpha }
    override fun setColorFilter(filter: ColorFilter?) { paint.colorFilter = filter }
    @Deprecated("Deprecated in Java") override fun getOpacity() = PixelFormat.TRANSLUCENT
}

/** .tabbar span.ic: a 56×30 pill (accent-soft when active) around a 22dp icon. */
internal class TabIcon(private val icon: NetMateIcon, private val pill: Int, private val density: Float) : Drawable() {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    override fun draw(canvas: Canvas) {
        val b = bounds
        if(Color.alpha(pill) > 0) { paint.color = pill; val r = b.height()/2f; canvas.drawRoundRect(b.left.toFloat(), b.top.toFloat(), b.right.toFloat(), b.bottom.toFloat(), r, r, paint) }
        val w = icon.intrinsicWidth; val h = icon.intrinsicHeight
        icon.setBounds(b.centerX() - w/2, b.centerY() - h/2, b.centerX() - w/2 + w, b.centerY() - h/2 + h); icon.draw(canvas)
    }
    override fun getIntrinsicWidth() = (56*density+.5f).toInt(); override fun getIntrinsicHeight() = (30*density+.5f).toInt()
    override fun setAlpha(alpha: Int) { paint.alpha = alpha }
    override fun setColorFilter(filter: ColorFilter?) { paint.colorFilter = filter }
    @Deprecated("Deprecated in Java") override fun getOpacity() = PixelFormat.TRANSLUCENT
}

/** themeswitch's cloud cell: nine 17px circles in a 60×30 grid (left, top of each circle). */
private val PUFFS = floatArrayOf(26f, 1f, 38f, 1f, 10f, 12f, 23f, 12f, 32f, 13f, 43f, 8f, 16f, 3f, 5f, 2f, 0f, 8f)
/** Scale of a cloud puff relative to themeswitch's 17px circle. */
private const val PUFF_SCALE = 1.3f
/** Cloud cells along the bottom: x, y in themeswitch's 120×50 space, opacity, and how far x moves at night. */
private val CLOUDS = floatArrayOf(-10f, 20f, .55f, -60f, 65f, 20f, .55f, 70f, 0f, 30f, 1f, -60f, 55f, 30f, 1f, 70f)
/** themeswitch's galaxy cell (80×50): x, y, bright (1) or faint (0). Bright stars twinkle. */
private val STARS = floatArrayOf(40f, 21f, 1f, 48f, 6f, 0f, 68f, 30f, 1f, 4f, 24f, 0f, 8f, 28f, 0f, 21f, 6f, 1f, 51f, 27f, 0f, 28f, 39f, 0f, 67f, 8f, 0f,
    26f, 14f, 0f, 63f, 20f, 0f, 16f, 35f, 0f, 60f, 35f, 0f, 36f, 6f, 1f, 56f, 12f, 1f, 43f, 37f, 1f, 23f, 27f, 1f, 12f, 12f, 1f)
/** Moon craters relative to the knob centre: dx, dy, radius. */
private val CRATERS = floatArrayOf(-11f, -10f, 8f, 12f, 4f, 6f, -5f, 15f, 4.5f, 14f, -15f, 3.5f)
/** Halo rings: growth beyond the knob radius and opacity. */
private val HALOS = floatArrayOf(44f, .07f, 29f, .1f, 15f, .14f)
/** CubicEase EaseInOut, which themeswitch uses for every move. */
private fun easeInOut(t: Float) = if(t < .5f) 4f*t*t*t else { val u = -2f*t + 2f; 1f - u*u*u/2f }

/**
 * Day/night toggle after Elsht666 「按钮-全月」 and JamesnetGroup/themeswitch, drawn in a 200×90 design space as
 * `draw_toggle` in apps/native-ui/src/linux.rs and design/toggle-lab.html: the knob is the sun by day and slides right
 * to become the full moon by night (craters after 40%), ringed by three halos; two cloud layers part to both sides and
 * fade as the stars rise.
 *
 * One TimeAnimator drives the switch (0.55 s; knob cubic-bezier(0.68,-0.1,0.265,1.2), colours `ease`), the press/hover
 * lift and the ambient motion (halo breathing, cloud sway, star twinkle). Ambient motion runs only while [setActive] is
 * true (activity resumed and window focused); otherwise it eases to a still frame and the animator stops. With animator
 * duration scale 0 everything jumps to the end state without ambient motion. Paints, paths and shaders are built once;
 * colour blends between day and night are drawn as two layers instead of new shaders, so onDraw allocates nothing.
 */
internal class DayNightToggle @JvmOverloads constructor(context: Context, attrs: AttributeSet? = null) : View(context, attrs) {
    private var night = true
    /** Knob position, 0 = day (left) .. 1 = night (right); overshoots during the switch. */
    private var position = 1f
    /** Colour and opacity blend between the day and night scenes. */
    private var progress = 1f
    private var fromPosition = 1f
    private var fromProgress = 1f
    private var target = 1f
    /** Milliseconds into the current switch, or -1 when none runs. */
    private var switchElapsed = -1L
    /** The activity is resumed and its window focused. */
    private var ambient = false
    /** Strength of the ambient motion 0..1. */
    private var motion = 0f
    /** Press/hover emphasis 0..1 (scale 1.07, brighter border). */
    private var lift = 0f
    /** Seconds of ambient motion; double so the phase stays precise over long sessions. */
    private var clock = 0.0
    private val knobCurve = PathInterpolator(.68f, -.1f, .265f, 1.2f)
    private val fadeCurve = PathInterpolator(.25f, .1f, .25f, 1f)
    private val ticker = TimeAnimator().apply { setTimeListener { _, _, delta -> step(delta) } }

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val border = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 2f; color = Color.WHITE }
    private val pill = Path().apply { addRoundRect(0f, 0f, 200f, 90f, 45f, 45f, Path.Direction.CW) }
    private val dayBackground = LinearGradient(27.5f, -27.5f, 172.5f, 117.5f, intArrayOf(hex("#4a90d9"), hex("#6fb0ee"), hex("#9bcbf5")), floatArrayOf(0f, .55f, 1f), Shader.TileMode.CLAMP)
    private val nightBackground = LinearGradient(27.5f, -27.5f, 172.5f, 117.5f, intArrayOf(hex("#070d1c"), hex("#111a30"), hex("#1c2a48")), floatArrayOf(0f, .55f, 1f), Shader.TileMode.CLAMP)
    /** Knob shapes in coordinates relative to the knob centre (radius 37). */
    private val radius = 37f
    private val dayGlow = RadialGradient(0f, 0f, radius + 14f, intArrayOf(hex("#ffc94d"), hex("#ffc94d"), 0x00ffc94d), floatArrayOf(0f, .8f*radius/(radius + 14f), 1f), Shader.TileMode.CLAMP)
    private val nightGlow = RadialGradient(0f, 0f, radius + 14f, intArrayOf(hex("#ffebaa"), hex("#ffebaa"), 0x00ffebaa), floatArrayOf(0f, .8f*radius/(radius + 14f), 1f), Shader.TileMode.CLAMP)
    private val sunBall = RadialGradient(-.3f*radius, -.32f*radius, 1.75f*radius, intArrayOf(hex("#fff1b8"), hex("#ffc23d"), hex("#f59e0b")), floatArrayOf(0f, .55f, 1f), Shader.TileMode.CLAMP)
    private val moonBall = RadialGradient(-.3f*radius, -.32f*radius, 1.75f*radius, intArrayOf(Color.WHITE, hex("#fff6d9"), hex("#e9d79a")), floatArrayOf(0f, .55f, 1f), Shader.TileMode.CLAMP)
    private val shine = LinearGradient(0f, -radius, 0f, radius, intArrayOf(0x73ffffff, 0x00ffffff, 0x00000000, 0x1a000000), floatArrayOf(0f, .12f, .85f, 1f), Shader.TileMode.CLAMP)
    /** One cloud cell: nine puffs in one winding path, so a translucent fill has no overlap seams. */
    private val puffs = Path().apply {
        fillType = Path.FillType.WINDING
        for(i in PUFFS.indices step 2) addCircle((PUFFS[i] + 8.5f)*PUFF_SCALE, (PUFFS[i + 1] + 8.5f)*PUFF_SCALE, 8.5f*PUFF_SCALE, Path.Direction.CW)
    }

    init { isClickable = true; isFocusable = true }

    /** Moves to the given theme. Without animation (first layout, or animator duration scale 0) it jumps to the end state. */
    fun setNight(value: Boolean, animate: Boolean) {
        val goal = if(value) 1f else 0f
        if(value == night && switchElapsed < 0) { if(position != goal || progress != goal) { position = goal; progress = goal; invalidate() }; return }
        night = value; fromPosition = position; fromProgress = progress; target = goal; switchElapsed = 0
        if(!animate || !isAttachedToWindow || !ValueAnimator.areAnimatorsEnabled()) { position = goal; progress = goal; switchElapsed = -1 }
        kick()
    }

    /**
     * Ambient motion on or off. The activity calls this from onResume/onPause/onWindowFocusChanged/onStop; [immediate]
     * (onStop) drops to the still frame at once instead of easing, so nothing ticks while the app is in the background.
     */
    fun setActive(active: Boolean, immediate: Boolean = false) {
        ambient = active
        if(immediate && !active) {
            motion = 0f; lift = 0f
            if(switchElapsed >= 0) { position = target; progress = target; switchElapsed = -1 }
            ticker.cancel(); invalidate(); return
        }
        kick()
    }

    private fun liftTarget() = if(isPressed || isHovered) 1f else 0f
    private fun motionTarget() = if(ambient) 1f else 0f

    /** Starts the ticker when something has to move; with animations disabled it jumps to the end state instead. */
    private fun kick() {
        if(!ValueAnimator.areAnimatorsEnabled() || !isAttachedToWindow) {
            ticker.cancel()
            if(switchElapsed >= 0) { position = target; progress = target; switchElapsed = -1 }
            lift = liftTarget(); motion = 0f; invalidate(); return
        }
        val moving = switchElapsed >= 0 || lift != liftTarget() || motion != motionTarget() || ambient
        if(moving && !ticker.isStarted) ticker.start() else if(!moving) invalidate()
    }

    private fun step(delta: Long) {
        if(switchElapsed >= 0) {
            switchElapsed += delta
            val k = (switchElapsed/550f).coerceIn(0f, 1f)
            position = fromPosition + (target - fromPosition)*knobCurve.getInterpolation(k)
            progress = fromProgress + (target - fromProgress)*fadeCurve.getInterpolation(k)
            if(k >= 1f) { position = target; progress = target; switchElapsed = -1 }
        }
        val amount = delta/200f
        val liftGoal = liftTarget(); val motionGoal = motionTarget()
        lift = if(lift < liftGoal) minOf(lift + amount, liftGoal) else maxOf(lift - amount, liftGoal)
        motion = if(motion < motionGoal) minOf(motion + amount, motionGoal) else maxOf(motion - amount, motionGoal)
        if(motion > 0f) clock += delta/1000.0
        invalidate()
        if(switchElapsed < 0 && lift == liftGoal && motion == motionGoal && !ambient) ticker.cancel()
    }

    override fun onAttachedToWindow() { super.onAttachedToWindow(); kick() }
    override fun onDetachedFromWindow() { ticker.cancel(); motion = 0f; super.onDetachedFromWindow() }
    override fun drawableStateChanged() { super.drawableStateChanged(); if(isAttachedToWindow) kick() else invalidate() }
    override fun onHoverChanged(hovered: Boolean) { super.onHoverChanged(hovered); if(isAttachedToWindow) kick() }
    override fun getAccessibilityClassName(): CharSequence = android.widget.Button::class.java.name

    override fun onDraw(canvas: Canvas) {
        val k = progress.coerceIn(0f, 1f); val day = 1f - k; val slide = easeInOut(k)
        // Room for the 1.07 lift and the drop shadow below the pill: 200×90 needs about 216×104 design units.
        val base = minOf(width/216f, height/104f)
        val scale = base*(1f + .07f*lift)
        val save = canvas.save()
        canvas.translate(width/2f, height/2f - 2f*base); canvas.scale(scale, scale); canvas.translate(-100f, -45f)
        // Soft drop shadow from stacked translucent pills (day: blue-tinted, night: black).
        paint.shader = null
        for(i in 0 until 5) {
            val grow = i*4f; val a = (.2f + .05f*k)/6f
            val l = 10f - grow/2; val t = 12f - grow/2; val r = l + 180f + grow; val b = t + 82f + grow; val c = (b - t)/2
            paint.color = 0xff2a68ad.toInt(); paint.alpha = fade(a*day); canvas.drawRoundRect(l, t, r, b, c, c, paint)
            if(k > 0f) { paint.color = Color.BLACK; paint.alpha = fade(a*k); canvas.drawRoundRect(l, t, r, b, c, c, paint) }
        }
        canvas.save(); canvas.clipPath(pill)
        paint.shader = dayBackground; paint.alpha = 255; canvas.drawRect(0f, 0f, 200f, 90f, paint)
        if(k > 0f) { paint.shader = nightBackground; paint.alpha = fade(k); canvas.drawRect(0f, 0f, 200f, 90f, paint) }
        paint.shader = null
        // Stars rise into place as night falls; bright ones twinkle while the window is active.
        if(k > 0f) for(i in 0 until STARS.size/3) {
            val bright = STARS[i*3 + 2] > 0f
            val twinkle = if(bright) motion*(1f - cos(2*Math.PI*(clock - i*.37)/2.2).toFloat())/2f else 0f
            paint.color = Color.WHITE; paint.alpha = fade(if(bright) k*(1f - .6f*twinkle) else k*.45f)
            canvas.drawCircle(14f + STARS[i*3]*1.7f, 8f + STARS[i*3 + 1]*1.5f + 10f*day, (if(bright) 1.9f else 1.3f)*(1f + .5f*twinkle), paint)
        }
        val cx = 45f + 110f*position; val cy = 45f
        // Halo rings around the knob, breathing gently while the window is active.
        val breathe = 1f + motion*.04f*(1f - cos(2*Math.PI*clock/3.0).toFloat())/2f
        for(i in HALOS.indices step 2) { paint.color = Color.WHITE; paint.alpha = fade(HALOS[i + 1]*(day + .45f*k)); canvas.drawCircle(cx, cy, (radius + HALOS[i])*breathe, paint) }
        // Two cloud layers along the bottom; at night they part to both sides and fade.
        for(j in 0 until CLOUDS.size/4) {
            val sway = motion*3f*sin(2*Math.PI*(clock/7.0 + j*.25)).toFloat()
            val ox = (CLOUDS[j*4] + 22f + CLOUDS[j*4 + 3]*slide)*1.6f + sway; val oy = CLOUDS[j*4 + 1]*1.6f + 4f
            paint.color = Color.WHITE; paint.alpha = fade(CLOUDS[j*4 + 2]*(1f - .85f*k))
            canvas.save(); canvas.translate(ox, oy); canvas.drawPath(puffs, paint); canvas.restore()
        }
        // Knob: the sun by day, the full moon by night.
        canvas.save(); canvas.translate(cx, cy)
        paint.color = Color.BLACK; paint.alpha = fade(.16f + .12f*k); canvas.drawCircle(0f, 3f, radius + 2f, paint)
        val glow = (.75f*breathe - .2f*k).coerceIn(0f, 1f)
        paint.color = Color.WHITE
        if(day > 0f) { paint.shader = dayGlow; paint.alpha = fade(glow*day); canvas.drawCircle(0f, 0f, radius + 14f, paint) }
        if(k > 0f) { paint.shader = nightGlow; paint.alpha = fade(glow*k); canvas.drawCircle(0f, 0f, radius + 14f, paint) }
        paint.shader = sunBall; paint.alpha = 255; canvas.drawCircle(0f, 0f, radius, paint)
        if(k > 0f) { paint.shader = moonBall; paint.alpha = fade(k); canvas.drawCircle(0f, 0f, radius, paint) }
        paint.shader = null
        val crater = ((k - .4f)/.6f).coerceIn(0f, 1f)
        if(crater > 0f) {
            paint.color = 0xffd6c48c.toInt(); paint.alpha = fade(.5f*crater)
            for(i in CRATERS.indices step 3) canvas.drawCircle(CRATERS[i], CRATERS[i + 1], CRATERS[i + 2], paint)
        }
        paint.shader = shine; paint.alpha = 255; canvas.drawCircle(0f, 0f, radius, paint)
        paint.shader = null
        canvas.restore()
        canvas.restore()
        // 2px border, brighter while pressed, hovered or keyboard-focused.
        val lit = maxOf(lift, if(isFocused && !isInTouchMode) 1f else 0f)
        border.alpha = fade((.25f + .2f*lit)*day + (.08f + .1f*lit)*k)
        canvas.drawRoundRect(1f, 1f, 199f, 89f, 44f, 44f, border)
        canvas.restoreToCount(save)
    }
}
